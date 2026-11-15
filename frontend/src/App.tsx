import { BrowserRouter, Routes, Route } from "react-router";

import Home from "./pages/home/Home";
import Dashboard from "./pages/dashboard/Dashboard";
import Templates from "./pages/templates/Templates";
import About from "./pages/about/About";
import NotFound from "./pages/not_found/NotFound";

import Navbar from "./components/navbar/Navbar";

function App() {
  return (
    <BrowserRouter>
      <div className="app">
        <Navbar />

        <main className="content">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/templates" element={<Templates />} />
            <Route path="/about" element={<About />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}

export default App;