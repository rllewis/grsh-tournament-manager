import Dashboard     from "./pages/Dashboard";
import Players       from "./pages/Players";
import Rosters       from "./pages/Rosters";
import Draft         from "./pages/Draft";
import Alternates    from "./pages/Alternates";
import History       from "./pages/History";
import Reports       from "./pages/Reports";
import Settings      from "./pages/Settings";
import HistoryImport from "./pages/HistoryImport";

const PAGES = {
  "grsh-tm-dashboard":      Dashboard,
  "grsh-tm-players":        Players,
  "grsh-tm-rosters":        Rosters,
  "grsh-tm-draft":          Draft,
  "grsh-tm-alternates":     Alternates,
  "grsh-tm-history":        History,
  "grsh-tm-reports":        Reports,
  "grsh-tm-settings":       Settings,
  "grsh-tm-history-import": HistoryImport,
};

export default function App() {
  const params = new URLSearchParams( window.location.search );
  const page   = params.get( "page" ) || "grsh-tm-dashboard";
  const Page   = PAGES[ page ] || Dashboard;

  return (
    <div style={{ background:"#F6F5F0", minHeight:"100vh" }}>
      <Page />
    </div>
  );
}
