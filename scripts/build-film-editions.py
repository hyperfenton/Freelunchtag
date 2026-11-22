"""Build the alternate static film entry pages from the shared guest and host markup."""
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]

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
        'name': 'Pass the Salsa', 'color': '#fff4d8', 'cue': 'Follow the lime',
        'title': 'Pass the<br><em>salsa.</em>',
        'description': 'Follow a lime from the taco window to a neighborhood picnic table. Meet your Meadows host, make a lunch plan and pick a question for the table.',
        'alt': 'A kraft bag at a taco stand reads “Pass the Salsa. Your Meadows host buys lunch.”'
    }
}

def build():
    page=(ROOT/'index.html').read_text()
    for cut,settings in EDITIONS.items():
        name=settings['name']
        description=settings['description']
        html=page.replace('<html lang="en">',f'<html lang="en" data-film="{cut}">')
        html=html.replace('Free Lunch Tag · Lunch is on us in Plano, TX', f'{name} · Free Lunch Tag')
        html=html.replace('Free Lunch Tag · Lunch is on us.',f'{name} · Free Lunch Tag')
        html=html.replace('Someone at Meadows Baptist Church wants to buy you lunch. Scan your Free Lunch Tag or enter its code to meet your host and pick a time together.',description)
        html=html.replace('A little tag. A real invitation to lunch with someone from Meadows in Plano.',description)
        html=html.replace('https://freelunchtag.com/"','https://freelunchtag.com/'+cut+'.html"')
        html=html.replace('assets/film/film-lift','assets/'+cut+'/film-offer').replace('.webp?v=walkthrough-1','.webp?v=1')
        html=html.replace('#120d25',settings['color'])
        html=html.replace('<link rel="preload" as="font"', '<link rel="stylesheet" href="film-editions.css?v=2">\n<link rel="preload" as="font"')
        html=html.replace('How lunch works</button>','Lunch guide</button>')
        html=html.replace('<button type="button" id="readScene"', '<button type="button" id="tableTalk" aria-haspopup="dialog">Draw a table question</button>\n      <button type="button" id="readScene"')
        html=html.replace('Scroll to follow the glass', settings['cue'])
        html=html.replace(f'<a href="{cut}.html">{name}</a>', '<a href="/">Original film</a>')
        html=html.replace('<span>We want to</span> <span>buy you</span> <em>lunch!</em>', settings['title'])
        html=html.replace('These are the people from Meadows inviting neighbors to lunch. Tap a name to say hello.', 'Your tag connects you to a real person from Meadows in Plano. You can read their introduction before making a plan.')
        html=html.replace('Someone from Meadows Baptist Church in Plano would love to share a meal with you. Your host picks up the tab.', 'Pizza, tacos, coffee. Your Meadows host covers your lunch. Pick a public spot together and meet someone new.')
        html=html.replace('Tap <strong>Text my host</strong> and suggest a time and place.', 'Tap <strong>Text my host</strong> and suggest a time and place. Want to bring a friend? Ask your host when you make the plan.')
        html=html.replace('“Hey, I got your lunch tag! Are you free for tacos this week?”','“Hey, I got your tag! Pizza Saturday? Can a friend join?”')
        html=html.replace('<details><summary>Do I need to attend church?', '<details><summary>Can I bring someone?</summary><p>Ask your host who can join and what lunch covers. If you’re under 18, arrange the meal with your parent or guardian.</p></details>\n          <details><summary>Do I need to attend church?')
        html=html.replace('Tell your host over lunch that you’d like to invite someone, too.', 'Over lunch, tell your host you’d like to welcome someone to the table, too.')
        html=html.replace('Bring your tag<br><em>to Meadows.</em>', 'Trade tags.<br><em>Keep in touch.</em>')
        html=html.replace('After lunch, bring your tag to Meadows Baptist Church if you’d like to visit. We’d love to meet you.', 'Keep your tag on your bag or trade designs after lunch. Each code stays with its original host. If you’d like to meet more of the Meadows crew in Plano, you’re welcome to visit.')
        html=html.replace('<div class="opening">','<div class="opening">\n        <noscript><img class="no-script-film" src="assets/'+cut+'/film-offer.webp" alt="'+settings['alt']+'"></noscript>')
        if cut=='pass-the-salsa':
            html=html.replace('Pizza Saturday?', 'Tacos at noon?')
            html=html.replace('Keep your tag on your bag', 'Keep your tag on your keys')
            html=html.replace('Draw a table question</button>', 'Mild or hot? Pick a question</button>')
            html=html.replace('Over lunch, tell your host you’d like to welcome someone to the table, too.', 'Tell your host you’d like to buy lunch for a neighbor next time.')
        (ROOT/(cut+'.html')).write_text(html)

if __name__=='__main__': build()
