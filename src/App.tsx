import { Route, Routes } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import Home from "./pages/Home";
import CreateGame from "./pages/CreateGame";
import GameView from "./pages/GameView";
import NotFound from "./pages/NotFound";

export default function App() {
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/new" element={<CreateGame />} />
        <Route path="/g/:id" element={<GameView />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </AppShell>
  );
}
