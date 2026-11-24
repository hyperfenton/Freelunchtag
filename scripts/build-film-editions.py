"""Build the selected homepage, its aliases, and the saved alternate films."""
from html import escape
import json
from pathlib import Path
import re

ROOT=Path(__file__).resolve().parents[1]
ARCHIVE_META='<meta name="robots" content="noindex, follow">\n'

EDITIONS = {
    'found-tag': {
        'name': 'Found Tag', 'color': '#eeeae5', 'cue': 'Scroll with the tag',
        'title': 'Look what<br><em>you found.</em>',
        'description': 'Follow the Free Lunch Tag from a weekend bag to a pizza counter to a record sleeve. A collectible invitation to lunch in Plano.',
        'alt': 'Classic Lightning Free Lunch Tag hanging from a peg.'
    },
    'lunch-line': {
        'name': 'The Lunch Line', 'color': '#f7ecd6', 'cue': 'Scroll down the counter',
        'title': 'Pull up<br><em>a chair.</em>',
        'description': 'Pull up a chair. Follow a pizza box down the counter to find your host, text a lunch plan, and swap collectible tags in Plano.',
        'alt': 'A pizza box opens to reveal “Pull up a chair.”'
    },
    'pass-the-salsa': {
        'name': 'Someone gave you a tag', 'path': 'your-tag', 'color': '#fff4d8',
        'page_title': 'Free Lunch Tag | Meadows Baptist Church in Plano', 'cue': 'See how lunch works', 'revision': 'quality-4',
        'title': 'Someone gave you a <em>Free Lunch Tag.</em>',
        'description': 'Your lunch invitation from Meadows Baptist Church in Plano, Texas. Scan your Free Lunch Tag or enter its code to find your host and make a plan.',
        'alt': 'A Classic Lightning keychain clips to a bag at the taco window. The bag reads “Someone gave you a Free Lunch Tag. Your Meadows host buys lunch.”'
    }
}

def build():
    # Keep the original film as the shared source so rebuilding never replaces
    # an edition with a different edition's artwork or duplicates its controls.
    page=(ROOT/'original-film.html').read_text()
    page=page.replace(ARCHIVE_META, '')
    page=page.replace('https://freelunchtag.com/original-film.html"', 'https://freelunchtag.com/"')
    for cut,settings in EDITIONS.items():
        name=settings['name']
        path=settings.get('path',cut)
        page_title=settings.get('page_title',f'{name} · Free Lunch Tag')
        revision=settings.get('revision','1')
        description=settings['description']
        html=page.replace('<html lang="en">',f'<html lang="en" data-film="{cut}">')
        html=html.replace('Free Lunch Tag · Lunch is on us in Plano, TX', page_title)
        html=html.replace('Free Lunch Tag · Lunch is on us.',page_title)
        html=html.replace('Someone at Meadows Baptist Church wants to buy you lunch. Scan your Free Lunch Tag or enter its code to meet your host and pick a time together.',description)
        html=html.replace('A little tag. A real invitation to lunch with someone from Meadows in Plano.',description)
        html=html.replace('https://freelunchtag.com/"','https://freelunchtag.com/'+path+'.html"')
        html=html.replace('assets/film/film-lift','assets/'+cut+'/film-offer').replace('.webp?v=walkthrough-1',f'.webp?v={revision}')
        html=html.replace('#120d25',settings['color'])
        html=html.replace('<link rel="preload" as="font"', '<link rel="stylesheet" href="film-editions.css?v=quality-4">\n<link rel="preload" as="font"')
        html=html.replace('How lunch works</button>','Lunch guide</button>')
        html=html.replace('<button type="button" id="readScene"', '<button type="button" id="tableTalk" aria-haspopup="dialog">Draw a table question</button>\n      <button type="button" id="readScene"')
        html=html.replace('Scroll to follow the glass', settings['cue'])
        html=html.replace(f'<a href="{path}.html">{name}</a>', '<a href="original-film.html">Original film</a>')
        html=html.replace('<span>We want to</span> <span>buy you</span> <em>lunch!</em>', settings['title'])
        html=html.replace('These are the people from Meadows inviting neighbors to lunch. Tap a name to say hello.', 'Your tag connects you to a real person from Meadows in Plano. You can read their introduction before making a plan.')
        html=html.replace('Someone from Meadows Baptist Church in Plano would love to share a meal with you. Your host picks up the tab.', 'Pizza, tacos, coffee. Your Meadows host covers your lunch. Pick a public spot together and meet someone new.')
        html=html.replace('Tap <strong>Text my host</strong> and suggest a time and place.', 'Tap <strong>Text my host</strong> and suggest a time and place. Want to bring a friend? Ask your host when you make the plan.')
        html=html.replace('“Hey, I got your lunch tag! Are you free for tacos this week?”','“Hey, I got your tag! Pizza Saturday? Can a friend join?”')
        html=html.replace('<details><summary>Do I need to attend church?', '<details><summary>Can I bring someone?</summary><p>Ask your host who can join and what lunch covers. If you’re under 18, arrange the meal with your parent or guardian.</p></details>\n          <details><summary>Do I need to attend church?')
        html=html.replace('Tell your host over lunch that you’d like to invite someone, too.', 'Over lunch, tell your host you’d like to welcome someone to the table, too.')
        html=html.replace('Bring your tag<br><em>to Meadows.</em>', 'Trade tags.<br><em>Keep in touch.</em>')
        html=html.replace('After lunch, bring your tag to Meadows Baptist Church if you’d like to visit. We’d love to meet you.', 'Keep your tag on your bag or trade designs after lunch. Each code stays with its original host. If you’d like to meet more of the Meadows crew in Plano, you’re welcome to visit.')
        html=html.replace('<div class="opening">','<div class="opening">\n        <noscript><img class="no-script-film" src="assets/'+cut+'/film-offer.webp?v='+revision+'" alt="'+settings['alt']+'"></noscript>')
        if cut=='pass-the-salsa':
            album=f'assets/{cut}/'
            home='https://freelunchtag.com/'
            church='https://www.meadowsbaptist.org/'
            social_image=f'{home}{album}film-offer-wide.webp?v={revision}'
            image_alt='A Free Lunch Tag clipped to a takeout bag at a taco window.'
            metadata=[
                ('property','og:site_name','Free Lunch Tag'),
                ('property','og:locale','en_US'),
                ('property','og:image:type','image/webp'),
                ('property','og:image:width','1920'),
                ('property','og:image:height','1080'),
                ('property','og:image:alt',image_alt),
                ('name','twitter:title',page_title),
                ('name','twitter:description',description),
                ('name','twitter:image',social_image),
                ('name','twitter:image:alt',image_alt),
            ]
            extra_meta='\n'.join(f'<meta {kind}="{key}" content="{escape(value,quote=True)}">' for kind,key,value in metadata)
            html=html.replace('<meta name="twitter:card" content="summary_large_image">', '<meta name="twitter:card" content="summary_large_image">\n'+extra_meta)
            organization_id=church+'#organization'
            website_id=home+'#website'
            schema={'@context':'https://schema.org','@graph':[
                {'@type':'WebSite','@id':website_id,'url':home,'name':'Free Lunch Tag',
                 'alternateName':'FreeLunchTag.com','description':description,'inLanguage':'en-US',
                 'publisher':{'@id':organization_id}},
                {'@type':'WebPage','@id':home+'#webpage','url':home,'name':page_title,
                 'description':description,'inLanguage':'en-US','isPartOf':{'@id':website_id},
                 'publisher':{'@id':organization_id},
                 'primaryImageOfPage':{'@type':'ImageObject','url':social_image,
                                       'width':1920,'height':1080}},
                {'@type':'Organization','@id':organization_id,'name':'Meadows Baptist Church','url':church,
                 'logo':{'@type':'ImageObject','url':home+'assets/meadows-mark.png',
                         'contentUrl':home+'assets/meadows-mark.png','width':787,'height':900}},
            ]}
            schema_tag='<script type="application/ld+json">'+json.dumps(schema,ensure_ascii=False,separators=(',',':'))+'</script>'
            html=re.sub(r'<script type="application/ld\+json">.*?</script>',lambda _:schema_tag,html,count=1,flags=re.S)
            maker_credit='''<a class="maker-credit" href="https://www.meadowsbaptist.org/" aria-label="Made by Meadows Baptist Church. Visit Meadowsbaptist.org."><img src="assets/meadows-mark.png" width="28" height="32" alt=""><span class="maker-copy"><span class="maker-kicker">Made by</span><strong>Meadows Baptist Church</strong></span></a>'''
            html=html.replace('<header class="film-tools">', maker_credit+'\n<header class="film-tools">')
            guide_credit='''        <a class="guide-maker" href="https://www.meadowsbaptist.org/"><img src="assets/meadows-mark.png" width="36" height="42" alt=""><span>Free Lunch Tag was created by <strong>Meadows Baptist Church</strong> in Plano, Texas.<span class="church-domain">Meadowsbaptist.org</span></span></a>
'''
            html=html.replace('      </div>\n      <div class="demonstration"', guide_credit+'      </div>\n      <div class="demonstration"')
            html=html.replace('<p>Made with love<br><em>by Meadows.</em></p>', '<p><a href="https://www.meadowsbaptist.org/">Made with love<br><em>by Meadows Baptist Church.</em></a></p>')
            html=html.replace('<div class="credits"><a href="https://www.meadowsbaptist.org">Meadows Baptist Church, Plano</a>', '<div class="credits">Created by <a href="https://www.meadowsbaptist.org/">Meadows Baptist Church</a> in Plano, Texas')
            html=html.replace('src="assets/meadows-logo.png"', 'src="assets/meadows-mark.png"')
            wide_sources=', '.join(f'{album}film-offer{suffix}.webp?v={revision} {width}w' for suffix,width in [('-wide-720',1280),('-wide',1920),('-wide-4k',3840)])
            phone_sources=', '.join(f'{album}film-offer{suffix}.webp?v={revision} {width}w' for suffix,width in [('-720',720),('',1080)])
            html=html.replace(f'srcset="{album}film-offer-wide.webp?v={revision}"', f'srcset="{wide_sources}" sizes="100vw"')
            html=html.replace(f'<img src="{album}film-offer.webp?v={revision}" alt="" fetchpriority="high">', f'<img src="{album}film-offer.webp?v={revision}" srcset="{phone_sources}" sizes="100vw" alt="" fetchpriority="high">')
            html=html.replace('<button type="button" id="motionToggle" aria-pressed="false">Pause motion</button>', '''<button type="button" id="motionToggle" aria-pressed="false">Pause motion</button>
      <div class="film-quality"><label for="filmQuality">Quality</label><span class="film-quality-choice"><select id="filmQuality" aria-describedby="filmQualityStatus"><option value="auto">Auto</option><option value="hd">HD</option><option value="4k">4K</option></select></span><p id="filmQualityStatus" role="status" aria-live="polite"></p></div>''')
            html=html.replace('Pizza Saturday?', 'Tacos at noon?')
            html=html.replace('Keep your tag on your bag', 'Keep your tag on your keys')
            html=html.replace('Draw a table question</button>', 'Mild or hot? Pick a question</button>')
            html=html.replace('Over lunch, tell your host you’d like to welcome someone to the table, too.', 'Tell your host you’d like to buy lunch for a neighbor next time.')
            html=html.replace('https://freelunchtag.com/your-tag.html"', 'https://freelunchtag.com/"')
            for link in [
                '<a href="found-tag.html">Found Tag</a>',
                '<a href="lunch-line.html">The Lunch Line</a>',
                '<a href="original-film.html">Original film</a>',
            ]:
                html=html.replace('      '+link+'\n', '')
            (ROOT/'index.html').write_text(html)
        else:
            html=html.replace('<meta charset="utf-8">\n', '<meta charset="utf-8">\n'+ARCHIVE_META)
        (ROOT/(path+'.html')).write_text(html)
        if path!=cut:
            # Preserve previously shared links, including QR fragments, on the same guest page.
            (ROOT/(cut+'.html')).write_text(html)

if __name__=='__main__': build()
