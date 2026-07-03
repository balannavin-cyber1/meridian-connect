import { Routes, Route, Navigate } from "react-router-dom";
import AppShell from "./components/AppShell";
import { SymbolProvider } from "./contexts/SymbolContext";
import Home from "./pages/Home";
import Positioning from "./pages/Positioning";
import MaxPainOI from "./pages/MaxPainOI";
import Breadth from "./pages/Breadth";
import Structure from "./pages/Structure";
import ExpiryMemory from "./pages/ExpiryMemory";
import Settings from "./pages/Settings";
import Order from "./pages/Order";
import Health from "./pages/Health";
import Journal from "./pages/Journal";
import NotFound from "./pages/NotFound";

export default function App() {
  return (
    <SymbolProvider>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<Navigate to="/home" replace />} />
          <Route path="/marketview" element={<Navigate to="/home" replace />} />
          <Route path="/home" element={<Home />} />
          <Route path="/positioning" element={<Positioning />} />
          <Route path="/max-pain" element={<MaxPainOI />} />
          <Route path="/breadth" element={<Breadth />} />
          <Route path="/structure" element={<Structure />} />
          <Route path="/expiry-memory" element={<ExpiryMemory />} />
          <Route path="/order" element={<Order />} />
          <Route path="/health" element={<Health />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/journal" element={<Journal />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </SymbolProvider>
  );
}
