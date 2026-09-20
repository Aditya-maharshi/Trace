import re

with open("Updated_frontend/government dashboard.html", "r", encoding="utf-8") as f:
    content = f.read()

css_match = re.search(r"<style>(.*?)</style>", content, re.DOTALL)
if css_match:
    css_content = css_match.group(1).strip()
    with open("apps/web/src/features/government/dashboard/government-dashboard.css", "w", encoding="utf-8") as f:
        f.write(css_content)

body_match = re.search(r"<body>(.*?)</body>", content, re.DOTALL)
if body_match:
    body_content = body_match.group(1).strip()
    body_content = body_content.replace('class=', 'className=')
    body_content = body_content.replace('for=', 'htmlFor=')
    body_content = body_content.replace('<!-- LEFT -->', '')
    body_content = body_content.replace('<!-- RIGHT -->', '')
    # Close unclosed inputs and hr
    body_content = body_content.replace('<input value="0x7a2f9c4e88b1d05a3e7f26c9a8d4b0e1f3c2a41d" aria-label="Wallet address">', '<input value="0x7a2f9c4e88b1d05a3e7f26c9a8d4b0e1f3c2a41d" aria-label="Wallet address" />')
    body_content = body_content.replace('<i className="t-illicit"></i><i className="t-clean"></i>', '<i className="t-illicit" /><i className="t-clean" />')
    body_content = body_content.replace('<i className="sw" style="background:#ff5c7a"></i>', '<i className="sw" style={{ background: "#ff5c7a" }} />')
    body_content = body_content.replace('<i className="sw" style="background:rgba(255,255,255,0.18)"></i>', '<i className="sw" style={{ background: "rgba(255,255,255,0.18)" }} />')
    body_content = body_content.replace('style="margin-top:16px"', 'style={{ marginTop: "16px" }}')
    body_content = body_content.replace('href="#"', 'href="/"')

    jsx = f"""import React from 'react';
import './government-dashboard.css';
import {{ Link }} from '@tanstack/react-router';

export function GovernmentDashboardPage() {{
  return (
    <div className="gov-dashboard-root">
      {{/* Ported directly from government dashboard.html */}}
      {body_content}
    </div>
  );
}}
"""
    with open("apps/web/src/features/government/dashboard/GovernmentDashboardPage.tsx", "w", encoding="utf-8") as f:
        f.write(jsx)

print("Done")
