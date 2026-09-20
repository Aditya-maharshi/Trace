import re

def scope_css(filepath, root_class):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    # Bare element selectors to scope (at beginning of rule)
    bare_elements = ['header', 'nav', 'aside', 'main', 'footer', 'section']
    
    for el in bare_elements:
        # Match "header{" or "header " at start of selector (including inside @media)
        # Pattern: el followed by { or space or , or :: or : (pseudo)
        content = re.sub(
            r'(?<![.\w#\-])(' + el + r')(\s*[\{,\s:>~+])',
            root_class + r' \1\2',
            content
        )

    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)
    print(f"Scoped {filepath}")

scope_css(
    'apps/web/src/features/government/landing/government-landing.css',
    '.gov-landing-root'
)
scope_css(
    'apps/web/src/features/government/dashboard/government-dashboard.css',
    '.gov-dashboard-root'
)
