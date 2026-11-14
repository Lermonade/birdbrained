import { BrowserRouter, Routes, Route } from "react-router";

import Home from "./pages/home/Home";
import Dashboard from "./pages/dashboard/Dashboard";
import Templates from "./pages/templates/Templates";
import About from "./pages/about/About";
import NotFound from "./pages/not_found/NotFound";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/templates" element={<Templates />} />
        <Route path="/about" element={<About />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;