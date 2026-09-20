import re

with open("Updated_frontend/Government landing page.html", "r", encoding="utf-8") as f:
    content = f.read()

# Extract CSS
css_match = re.search(r"<style>(.*?)</style>", content, re.DOTALL)
if css_match:
    css_content = css_match.group(1).strip()
    # Add a root wrapper class to CSS to avoid global bleeding if we wanted, or just make it global.
    # We will just write it to a CSS file.
    with open("apps/web/src/features/government/landing/government-landing.css", "w", encoding="utf-8") as f:
        f.write(css_content)

# Extract Body
body_match = re.search(r"<body>(.*?)<script>", content, re.DOTALL)
if body_match:
    body_content = body_match.group(1).strip()
    # Convert HTML to JSX
    body_content = body_content.replace('class=', 'className=')
    body_content = body_content.replace('for=', 'htmlFor=')
    body_content = body_content.replace('<canvas id="hero-canvas"></canvas>', '<div className="hero-scene-container" style={{ position: "absolute", inset: 0, zIndex: 0 }}><LandingScene prices={prices} onSelectNode={setSelectedNode} /></div>')
    # Close unclosed tags
    body_content = body_content.replace('<input id="f1" type="text" placeholder="Full name and rank">', '<input id="f1" type="text" placeholder="Full name and rank" />')
    body_content = body_content.replace('<input id="f2" type="text" placeholder="e.g. Cyber Crime Cell, Ahmedabad">', '<input id="f2" type="text" placeholder="e.g. Cyber Crime Cell, Ahmedabad" />')
    body_content = body_content.replace('<input id="f3" type="email" placeholder="name@agency.gov.in">', '<input id="f3" type="email" placeholder="name@agency.gov.in" />')
    
    jsx = f"""import React, {{ useState }} from 'react';
import './government-landing.css';
import {{ LandingScene }} from '@/features/commercial/landing/LandingScene';
import {{ useCryptoPrices }} from '@/features/commercial/hooks/use-crypto-prices';
import {{ Link }} from '@tanstack/react-router';

export function GovernmentLandingPage() {{
  const {{ prices }} = useCryptoPrices();
  const [selectedNode, setSelectedNode] = useState<any>(null);

  // We need to inject the LandingScene into the hero section
  return (
    <div className="gov-landing-root">
      {body_content}
    </div>
  );
}}
"""
    with open("apps/web/src/features/government/landing/GovernmentLandingPage.tsx", "w", encoding="utf-8") as f:
        f.write(jsx)

print("Done")
