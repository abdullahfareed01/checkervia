/** Demo is selected by one development-only URL parameter, never stored. */
export function DataSourceBar() {
  const sample = import.meta.env.DEV && typeof location !== "undefined" && new URLSearchParams(location.search).has("demo");
  return <div className={`adm-source-bar${sample ? " adm-source-sample" : ""}`} aria-label="Dashboard data source">
    <div className="adm-source-description"><strong className="adm-source-label">{sample ? "Sample data" : "Game data"}</strong>
      <span className="adm-dim adm-small">{sample ? "Preview only. Your game and players are untouched." : "Private access to your game records."}</span></div>
    <div className="adm-source-actions">{sample && <a className="adm-button adm-button-quiet" href="/admin/">Use game data</a>}
      <a className="adm-button adm-button-quiet" href="/" target="_blank" rel="noopener noreferrer">Open game</a></div>
  </div>;
}
