# Gamma cumulative silhouette scale

## Build
- Keep each strike bar on the existing visible-window per-strike scale.
- Give cumulative gamma an independent signed scale based on the cumulative series range, anchored to the shared centre zero axis.
- Draw the cumulative values as 2px white points joined by a faint hairline curve across ladder rows.
- Preserve zero crossings at the centre line and render the curve behind labels and named level rules.

## Verify
- Check Full chain on NIFTY for the centre crossing near 21,8xx.
- Check SENSEX remains entirely right of centre when all cumulative values are positive.
- Confirm the per-strike bar widths are unchanged and the preview has no errors.
