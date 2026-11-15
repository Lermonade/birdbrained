import { BrowserRouter, Routes, Route } from "react-router";

import Dashboard from "./pages/dashboard/Dashboard";
import Templates from "./pages/templates/Templates";
import About from "./pages/about/About";
import NotFound from "./pages/not_found/NotFound";

import Navbar from "./components/navbar/Navbar";

function App() {
  return (
    <BrowserRouter>
      <Navbar />

      <Routes>
        {/* One Dashboard for both paths, so the globe stays mounted:
            "/" shows the landing over it, "/dashboard" the controls. */}
        <Route element={<Dashboard />}>
          <Route index />
          <Route path="dashboard" />
        </Route>
        <Route path="/templates" element={<Templates />} />
        <Route path="/about" element={<About />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
