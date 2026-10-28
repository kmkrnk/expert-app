#!/usr/bin/env python3
"""Генератор демо: публичный Telegram-канал эксперта -> experts/<id>/content.js + картинки.

Запуск:  python3 tools/generate.py <username|t.me/ссылка> [--id имя] [--pages 10]

Берёт только публичные данные со страниц t.me/<канал> и t.me/s/<канал>.
Продукты и цены определяются эвристикой — после генерации их стоит проверить
(скрипт печатает отчёт о найденных ценах).
"""
import argparse
import collections
import html
import json
import os
import re
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EMOJI = re.compile('[\U0001F000-\U0001FAFF☀-➿️‍⬀-⯿]')

# Темы для разбивки бесплатных постов. Первая подходящая по числу совпадений — тема поста.
TOPICS = [
    ('Шея и голова', r'шея|шеи|шею|голов|холк|мигрен'),
    ('Спина и осанка', r'спин|поясниц|осанк|позвоноч|грыж'),
    ('Ноги и суставы', r'колен|стоп|ног[иау]|сустав|тазобедр'),
    ('Сон и стресс', r'\bсон\b|сна\b|спите|бессонн|стресс|тревог|дыхан|нервн'),
    ('Питание', r'питани|еда|едим|белок|сахар|диет|калори|витамин|завтрак|продукт[ыа] питания'),
    ('Похудение', r'похуд|вес[аеу]?\b|жир|талия|лишн'),
    ('Тренировки', r'трениров|упражнен|зарядк|растяжк|мышц'),
    ('Отношения', r'отношени|партн[её]р|муж|брак|любов|расстав'),
    ('Эмоции и самооценка', r'эмоци|самооцен|чувств|выгоран|обид|страх|депресс'),
    ('Дети и семья', r'реб[её]н|дет[иейям]|родител|материнств|беремен'),
    ('Кожа и красота', r'кож[аеиу]|уход|морщин|акне|косметолог|волос'),
    ('Деньги и работа', r'деньг|доход|карьер|бизнес'),
]
SALES = re.compile(r'₽|руб\b|руб\.|скидк|тариф|стартует|последний день|двери|вступ|оплат|места|запис[ьи] на', re.I)


def fetch(url):
    # curl вместо urllib: у системного Python на macOS часто нет корневых сертификатов
    r = subprocess.run(['curl', '-sL', '--max-time', '25', '-A', 'Mozilla/5.0', url], capture_output=True)
    return r.stdout.decode('utf-8', 'ignore')


def download(url, path):
    subprocess.run(['curl', '-sL', '--max-time', '25', url, '-o', path], check=False)
    return os.path.exists(path) and os.path.getsize(path) > 1000


def clean(fragment):
    s = re.sub(r'<br\s*/?>', '\n', fragment)
    s = re.sub(r'<[^>]+>', '', s)
    return html.unescape(s).strip()


def meta(page, prop):
    m = re.search(r'<meta property="%s" content="([^"]*)"' % re.escape(prop), page)
    return html.unescape(m.group(1)) if m else ''


def parse_posts(page):
    posts = []
    for blk in re.split(r'<div class="tgme_widget_message_wrap', page)[1:]:
        pid = re.search(r'data-post="([^"]+)"', blk)
        if not pid:
            continue
        txt = re.search(r'tgme_widget_message_text[^>]*>(.*?)</div>', blk, re.S)
        views = re.search(r'tgme_widget_message_views">([^<]+)', blk)
        date = re.search(r'datetime="([^"]+)"', blk)
        img = re.search(r"tgme_widget_message_photo_wrap[^>]*background-image:url\('([^']+)'", blk)
        posts.append({
            'id': pid.group(1),
            'num': int(pid.group(1).split('/')[-1]),
            'date': date.group(1)[:10] if date else '',
            'views': views.group(1) if views else '0',
            'img': img.group(1) if img else None,
            'video': 'tgme_widget_message_video' in blk,
            'text': clean(txt.group(1)) if txt else '',
            'links': re.findall(r'href="(https?://[^"]+)"', txt.group(1)) if txt else [],
        })
    return posts


def views_num(v):
    v = (v or '0').replace(',', '.')
    mult = 1000 if v.endswith('K') else 1_000_000 if v.endswith('M') else 1
    try:
        return float(v.rstrip('KM')) * mult
    except ValueError:
        return 0


def views_ru(v):
    n = views_num(v)
    if n >= 1000:
        return ('%.1f' % (n / 1000)).rstrip('0').rstrip('.').replace('.', ',') + ' тыс.'
    return str(int(n))


def subs_ru(n):
    return ('%.1f' % (n / 1000)).rstrip('0').rstrip('.').replace('.', ',') + ' тыс.' if n >= 1000 else str(n)


def strip_emoji(s):
    return re.sub(r'[ \t]+', ' ', EMOJI.sub('', s)).strip()


def title_and_excerpt(text):
    lines = [strip_emoji(l).strip(' .') for l in text.split('\n')]
    lines = [l for l in lines if len(l) > 2]
    if not lines:
        return '', ''
    title = lines[0][:100]
    body = ''
    for l in lines[1:]:
        body += l if not body else ((' ' if body[-1] in '.!?…:;,—' else '. ') + l)
        if len(body) > 160:
            break
    if len(body) > 160:
        body = body[:160].rsplit(' ', 1)[0].rstrip(',.;:—') + '…'
    return title, body


def topic_of(text):
    best, score = None, 0
    for name, rx in TOPICS:
        n = len(re.findall(rx, text, re.I))
        if n > score:
            best, score = name, n
    return best


def find_prices(posts):
    """Строки с ценами: (номер поста, строка, цена). Для отчёта и черновика продуктов."""
    out = []
    for p in posts:
        for line in p['text'].split('\n'):
            for m in re.finditer(r'(\d[\d  ]{2,7})\s?(?:₽|руб)', line):
                price = int(re.sub(r'\D', '', m.group(1)))
                if 300 <= price <= 300000:
                    out.append((p['num'], strip_emoji(line)[:140], price))
    return out


def product_names(posts):
    """Названия продуктов: слова в «кавычках» или КАПСОМ рядом со словами курс/клуб/марафон."""
    names = collections.Counter()
    for p in posts:
        for m in re.finditer(r'(курс|клуб|марафон|интенсив|практикум|программ\w*|гайд|наставничеств\w*|вебинар)\s*[«"]([^»"]{3,40})[»"]', p['text'], re.I):
            names[(m.group(1).lower(), m.group(2).strip())] += 1
        for m in re.finditer(r'(курс|клуб|марафон|интенсив)\s+([А-ЯЁ][А-ЯЁ\- ]{3,30}[А-ЯЁ])', p['text']):
            names[(m.group(1).lower(), m.group(2).strip().capitalize())] += 1
        # «Клуб Здоровых Людей» — название из слов с заглавной буквы
        for m in re.finditer(r'\b(Клуб|Школ[аеуы]|Академи[яи])\s+([А-ЯЁ][а-яё]+(?:\s+[А-ЯЁ][а-яё]+){1,3})', p['text']):
            names[(m.group(1).lower()[:4] == 'клуб' and 'клуб' or 'школа', m.group(1)[:4].replace('Школ', 'Школа').replace('Акад', 'Академия').replace('Клуб', 'Клуб') + ' ' + m.group(2))] += 1
    return names


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('channel')
    ap.add_argument('--id')
    ap.add_argument('--pages', type=int, default=10)
    a = ap.parse_args()

    user = re.sub(r'^(https?://)?(t\.me/)?(s/)?@?', '', a.channel).strip('/').split('/')[0]
    eid = (a.id or user).lower().replace('_', '-')
    out_dir = os.path.join(ROOT, 'experts', eid)
    img_dir = os.path.join(out_dir, 'img')
    os.makedirs(img_dir, exist_ok=True)

    info = fetch('https://t.me/' + user)
    title = meta(info, 'og:title')
    desc = meta(info, 'og:description')
    extra = re.search(r'tgme_page_extra">([^<]+)', info)
    subs = int(re.sub(r'\D', '', extra.group(1))) if extra and 'subscriber' in extra.group(1) else 0
    if not title or not subs:
        sys.exit('Канал @%s не найден или это не публичный канал' % user)
    desc_full = clean(re.search(r'tgme_page_description[^>]*>(.*?)</div>', info, re.S).group(1)) if 'tgme_page_description' in info else desc

    # Посты: листаем назад страницами по ~20
    posts, before = [], None
    for _ in range(a.pages):
        page = fetch('https://t.me/s/%s%s' % (user, '?before=%d' % before if before else ''))
        chunk = parse_posts(page)
        if not chunk:
            break
        posts += chunk
        before = min(p['num'] for p in chunk)
    uniq = {p['num']: p for p in posts}
    posts = sorted(uniq.values(), key=lambda p: p['num'])
    print('Канал: %s · %d подписчиков · постов: %d' % (title, subs, len(posts)))

    # Аватар
    avatar = meta(info, 'og:image')
    download(avatar, os.path.join(img_dir, 'avatar.jpg'))

    # Имя и роль: «Имя Фамилия | Роль» или «Роль с Именем»
    parts = [strip_emoji(x) for x in re.split(r'\s[|•—–-]\s', title, maxsplit=1)]
    name = parts[0]
    desc_lines = [strip_emoji(l) for l in desc_full.split('\n') if strip_emoji(l)]
    role = parts[1] if len(parts) > 1 else (desc_lines[0] if desc_lines and len(desc_lines[0]) < 70 else '')
    plain = [l for l in desc_lines if not re.search(r'https?://|@\w|t\.me|реклам|РКН|госуслуг|№|\d{6,}', l, re.I) and l != role]
    tagline = next((l for l in plain if 25 <= len(l) <= 120), '')
    badges = [l.strip(' .') for l in plain if 6 <= len(l) <= 42 and l != tagline][:3]

    # Контакты из описания
    contacts = [{'icon': 'send', 'title': 'Канал в Telegram', 'subtitle': '@' + user, 'url': 'https://t.me/' + user}]
    for h in re.findall(r'@([A-Za-z0-9_]{4,})', desc_full):
        if h.lower() != user.lower():
            bot = h.lower().endswith('bot')
            contacts.append({'icon': 'chat', 'title': 'Бот' if bot else 'Написать', 'subtitle': '@' + h, 'url': 'https://t.me/' + h})
    for url in re.findall(r'https?://\S+', desc_full):
        url = url.rstrip('.,)')
        if 'max.ru' in url:
            contacts.append({'icon': 'max', 'title': 'Канал в MAX', 'subtitle': 'Резервный канал', 'url': url})
        elif 'vk.com' in url:
            contacts.append({'icon': 'vk', 'title': 'ВКонтакте', 'subtitle': 'Страница в VK', 'url': url})
        elif not re.search(r'gosuslugi|clck\.ru/3|rkn|knd\.gov', url):
            contacts.append({'icon': 'arrow', 'title': 'Сайт', 'subtitle': re.sub(r'^https?://(www\.)?', '', url)[:40], 'url': url})
    contacts = contacts[:5]
    lead_handle = next((c['subtitle'] for c in contacts[1:] if c['title'] == 'Написать'), '@' + user)

    # Бесплатные посты: самые просматриваемые не-продающие с нормальным текстом
    content_posts = [p for p in posts if len(p['text']) > 180 and not SALES.search(p['text'])]
    content_posts.sort(key=lambda p: -views_num(p['views']))
    chosen = []
    for p in content_posts[:24]:
        t, ex = title_and_excerpt(p['text'])
        # Заголовок-ссылка или пост-продажа гайдов — не контент
        if len(t) < 8 or re.search(r'https?://|t\.me/|@\w', t) or re.search(r'taplink|boosty|бусти|купить|промокод', p['text'], re.I):
            continue
        item = {'topic': topic_of(p['text']) or 'Полезное', 'title': t, 'excerpt': ex, 'img': None,
                'views': views_ru(p['views']), 'url': 'https://t.me/' + p['id'], 'video': p['video']}
        if p['img']:
            fn = 'post-%d.jpg' % p['num']
            if download(p['img'], os.path.join(img_dir, fn)):
                item['img'] = 'img/' + fn
        chosen.append(item)
        if len(chosen) >= 18:
            break

    tcount = collections.Counter(c['topic'] for c in chosen)
    keep = [t for t, n in tcount.most_common() if n >= 2 and t != 'Полезное'][:4]
    for c in chosen:
        if c['topic'] not in keep:
            c['topic'] = 'Полезное'
    topic_names = keep + (['Полезное'] if any(c['topic'] == 'Полезное' for c in chosen) else [])
    topic_ids = {n: 't%d' % i for i, n in enumerate(topic_names)}
    for c in chosen:
        c['topic'] = topic_ids[c['topic']]
    with_img = [c for c in chosen if c['img']]
    for c in (with_img or chosen)[:6]:
        c['featured'] = True

    # Черновик продуктов из названий и цен
    prices = find_prices(posts)
    names = product_names(posts)
    products = []
    # Клуб/школа — главный продукт, его ставим первым
    top = sorted(names.most_common(8), key=lambda kv: (kv[0][0] not in ('клуб', 'школа'), -kv[1]))[:4]
    for (kind, pname), _n in top:
        key = pname.lower().split()[-1][:5] if kind != 'клуб' else 'клуб'
        near = [pr for num, line, pr in prices if key in line.lower() and not re.search(r'вход|ценност|итого|=', line, re.I)]
        price = collections.Counter(near).most_common(1)[0][0] if near else 0
        products.append({
            'id': 'p%d' % len(products), 'kind': kind.capitalize(), 'title': pname,
            'subtitle': 'Описание продукта — уточнить у эксперта', 'button': 'Купить' if price else 'Записаться',
            'features': ['Пункт программы 1', 'Пункт программы 2', 'Пункт программы 3'],
            'tariffs': [{'name': 'Участие', 'price': price}],
        })
    products.append({
        'id': 'consult', 'kind': 'Личная работа', 'title': 'Консультация', 'button': 'Записаться',
        'subtitle': 'Разберём вашу ситуацию и подберём формат', 'features': ['Разбор запроса', 'План действий', 'Ответы на вопросы'],
        'tariffs': [{'name': 'Консультация', 'price': 0}],
    })
    paid = [p for p in products if p['tariffs'][0]['price']]
    cheapest = min(paid, key=lambda p: p['tariffs'][0]['price']) if paid else None

    # Отзывы: отдельный канал из описания («Отзывы: @...») или посты со словом «отзыв»
    reviews = {'text': [], 'shots': [], 'more': ''}
    rv = re.search(r'[Оо]тзыв\w*[^@\n]{0,15}@([A-Za-z0-9_]{4,})', desc_full)
    if rv:
        reviews['more'] = 'https://t.me/' + rv.group(1)
        rposts = parse_posts(fetch('https://t.me/s/' + rv.group(1)))
        for p in reversed(rposts):
            if p['img'] and len(reviews['shots']) < 4:
                fn = 'rev-%d.jpg' % p['num']
                if download(p['img'], os.path.join(img_dir, fn)):
                    reviews['shots'].append('img/' + fn)
            elif 80 < len(p['text']) < 700 and len(reviews['text']) < 3:
                reviews['text'].append({'name': 'Участник', 'meta': 'Отзыв из канала', 'text': strip_emoji(p['text'])[:400]})

    first = name.split()[0]
    C = {
        'demo': 'Демо-версия для канала @%s' % user,
        'theme': {},
        'profile': {
            'name': name, 'role': role, 'avatar': 'img/avatar.jpg', 'tagline': tagline, 'badges': badges,
            'stats': [{'value': subs_ru(subs), 'label': 'читают канал'},
                      {'value': '%d+' % (len(posts) // 10 * 10) if len(posts) >= 20 else str(len(posts)), 'label': 'постов за последнее время'},
                      {'value': views_ru(max((p['views'] for p in posts), key=views_num, default='0')), 'label': 'просмотров у лучшего поста'}],
            'footer': name,
        },
        'promo': ({'product': cheapest['id'], 'tag': cheapest['kind'], 'title': cheapest['title'],
                   'text': cheapest['subtitle'], 'price': cheapest['tariffs'][0]['price'], 'button': 'Подробнее'} if cheapest else None),
        'fab': 'Записаться на консультацию',
        'quick': [
            {'icon': 'bag', 'title': 'Продукты', 'subtitle': 'Курсы и форматы работы', 'action': 'tab:shop'},
            {'icon': 'chat', 'title': 'Консультация', 'subtitle': 'Разберём вашу ситуацию', 'action': 'lead:Консультация'},
            {'icon': 'play', 'title': 'Бесплатные материалы', 'subtitle': ', '.join(topic_names[:3]) or 'Лучшее из канала', 'action': 'tab:free'},
            {'icon': 'star', 'title': 'Отзывы', 'subtitle': 'Результаты учеников', 'action': 'tab:reviews'},
        ],
        'events': [],
        'topics': [{'id': topic_ids[n], 'name': n} for n in topic_names],
        'posts': chosen,
        'free': {'eyebrow': 'Бесплатно', 'title': 'Полезные материалы', 'text': 'Лучшее из канала, разложенное по темам'},
        'shop': {'eyebrow': 'Продукты', 'title': 'Работать со мной', 'text': 'Выберите формат, который подходит вам'},
        'products': products,
        'reviewsTitle': 'Отзывы', 'reviewsText': 'Что говорят ученики и клиенты',
        'reviews': reviews,
        'lead': {'title': 'Запись на консультацию', 'text': 'Оставьте контакт — %s напишет вам в Telegram' % first,
                 'placeholder': 'Коротко опишите ваш запрос', 'button': 'Отправить заявку', 'note': 'Ответ в течение дня',
                 'doneTitle': 'Заявка отправлена', 'doneText': '%s свяжется с вами: %s' % (first, lead_handle),
                 'topics': ['Консультация'] + [p['title'] for p in products if p['id'] != 'consult'] + ['Другой вопрос']},
        'contacts': contacts,
    }
    with open(os.path.join(out_dir, 'content.js'), 'w', encoding='utf-8') as f:
        f.write('// Черновик сгенерирован tools/generate.py из публичного канала @%s. Проверьте продукты и цены.\n' % user)
        f.write('window.EXPERT = ' + json.dumps(C, ensure_ascii=False, indent=2) + ';\n')

    print('Темы: %s' % (', '.join(topic_names) or '—'))
    print('Постов в «Бесплатно»: %d (с картинками: %d)' % (len(chosen), len(with_img)))
    print('Продукты (черновик): %s' % ('; '.join('%s «%s» %s' % (p['kind'], p['title'], p['tariffs'][0]['price'] or '—') for p in products)))
    print('Отзывы: %d текстов, %d скриншотов' % (len(reviews['text']), len(reviews['shots'])))
    if prices:
        print('\nЦены в постах (проверить):')
        seen = set()
        for num, line, pr in reversed(prices):
            if line not in seen:
                seen.add(line)
                print('  #%d  %s' % (num, line))
            if len(seen) >= 12:
                break
    print('\nГотово: experts/%s/content.js  ->  ?e=%s' % (eid, eid))


if __name__ == '__main__':
    main()
