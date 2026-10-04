# Hazard data layer (not part of the environment)

The city ships **without** riddles/hazards. They are a separate data layer that the game shell loads
**per user** after login (the user's grade/level decides the pack). Each hazard is attached to a named
anchor in the city (`ANCHOR_*`, listed in `data/anchors.json`).

## Loading
```js
window.addEventListener('city-ready', async ({ detail: city }) => {
  city.hazards.setResolver((user) => `data/hazards/grade-${user.grade}-level-${user.level}.json`);
  city.hazards.registerType('kid_runs_after_ball', (hazard, anchor, ctx) => {
    const g = new ctx.THREE.Group();   // build/clone whatever 3D content the hazard needs
    return g;                          // placed at the anchor's position + facing
  });
  await city.hazards.loadForUser({ id: 'u123', grade: 3, level: 2 });
});
```

## Pack format
```json
{
  "version": 1,
  "grade": 3,
  "level": 2,
  "hazards": [
    {
      "id": "h01",
      "anchor": "ANCHOR_01_SchoolCrosswalk",
      "type": "kid_runs_after_ball",
      "question": { "text_he": "...", "answers_he": ["...", "..."], "correct": 0 },
      "params": {}
    }
  ]
}
```
* `anchor` must be one of the ids in `data/anchors.json`.
* `type` is resolved through `registerType()`; unknown types still get an empty holder group at the anchor.
* `question` / `params` are free-form – the environment never reads them.

Events: `city.hazards.addEventListener('loaded', e => e.detail)`.
Dev helpers: open with `?dev=1` (or press **A**) to see all anchors as pink rings with labels.
