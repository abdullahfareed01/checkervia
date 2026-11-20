// D111: as in the owner's mockup, a yellow line says when the dashboard shows
// sample data, and it can be closed. Demo is selected by one development
// only URL parameter, never stored. Game data needs no banner.
import { useState } from "react";
import { Icon } from "./icons";

export function DataSourceBar() {
  const sample = import.meta.env.DEV && typeof location !== "undefined" && new URLSearchParams(location.search).has("demo");
  const [shown, setShown] = useState(true);
  if (!sample || !shown) return null;
  return <div className="adm-source-bar adm-source-sample" role="note" aria-label="Dashboard data source">
    <Icon name="info" className="adm-source-icon" />
    <p className="adm-source-description"><strong className="adm-source-label">Sample data</strong><span>Preview only. Your game and players are untouched.</span></p>
    <button type="button" className="adm-source-close" aria-label="Close the sample data note" onClick={() => setShown(false)}><Icon name="close" /></button>
  </div>;
}
