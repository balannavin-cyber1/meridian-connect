import { Routes, Route, Navigate } from "react-router-dom";
import AppShell from "./components/AppShell";
import Marketview from "./pages/Marketview";
import Settings from "./pages/Settings";
import Order from "./pages/Order";
import Health from "./pages/Health";
import Journal from "./pages/Journal";
import NotFound from "./pages/NotFound";

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/" element={<Navigate to="/marketview" replace />} />
        <Route path="/marketview" element={<Marketview />} />
        <Route path="/order" element={<Order />} />
        <Route path="/health" element={<Health />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/journal" element={<Journal />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
