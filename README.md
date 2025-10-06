# Risk preference hazard prioritiser

This prototype lets stakeholders express their risk priorities and immediately
see how the weighting changes the order of key hazards.

## Getting started

There are two quick ways to view the prototype:

1. **Double-click `index.html`.** Because all assets are local or loaded from a
   CDN, opening the file directly in your browser works for simple
   experimentation.
2. **Serve the folder locally** if you prefer a `http://` URL (for example,
   some browsers block certain features on `file://` pages):

   ```bash
   cd /path/to/survey
   python3 -m http.server 8000
   ```

   Then visit <http://localhost:8000/> and the app will load automatically.

## How it works

* Adjust the three sliders to express how much you want to emphasise safety,
  financial, and environmental considerations. A panel next to the controls
  shows the normalised weighting applied in the scoring model.
* Use **Balance weights** to quickly equalise the sliders or **Reset to
  defaults** to return to the initial emphasis profile.
* The app normalises your inputs into weights and combines them with the
  illustrative hazard data in `app.js` to create a composite score. The
  "Current top priority" callout highlights the leading hazard and the driver
  behind its score.
* The bar chart and ranked list update in real time to highlight the hazards
  that best match the selected preferences. Each hazard card shows a breakdown
  of how each dimension contributes to the priority score.

To customise the tool, edit `app.js` to add new hazards, change the weighting
formula, or connect it to your own data source.
