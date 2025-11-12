SAFI Site with Netlify CMS
============================
Structure:
- index.html (reads editable data from /data/*.json)
- /data/site.json, services.json, projects.json, workers.json (editable via CMS)
- /images (logo and gallery)
- /admin (Netlify CMS)

How to deploy on Netlify:
1) Create a new site from this folder.
2) In Netlify > Settings > Identity: Enable Identity and Git Gateway.
3) In Identity > Registration: set 'Invite only' and add your email.
4) Visit /admin on your site (e.g., https://your-site.netlify.app/admin) and log in.
5) Edit 'Site Settings', 'Services', 'Projects', or 'Crew Directory' and publish. Changes update the JSON files.

Where to edit without code:
- Open /admin for a visual editor (Netlify CMS). Upload images to /images.
