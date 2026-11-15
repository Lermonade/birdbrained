import { NavLink, useLocation } from "react-router";
import styles from "./navbar.module.css";

import logo from "../../assets/birdbrained_logo.png";

export default function Navbar() {
  const location = useLocation();
  const hasBackground = location.pathname === "/dashboard";

  return (
    <nav className={`${styles.navbar} ${hasBackground ? styles.withBackground : ""}`}>
      <NavLink to="/" className={styles.logo}>
        <img
          src={logo}
          alt="BirdBrained logo"
          className={styles.logoImage}
        />
        <span>BirdBrained</span>
      </NavLink>

      <div className={styles.navLinks}>
        <NavLink to="/" className={styles.navLink}>
          Home
        </NavLink>

        <NavLink to="/dashboard" className={styles.navLink}>
          Dashboard
        </NavLink>

        <NavLink to="/templates" className={styles.navLink}>
          Templates
        </NavLink>

        <NavLink to="/about" className={styles.navLink}>
          About
        </NavLink>
      </div>

      <NavLink to="/templates" className={styles.cta}>
        Try it out
      </NavLink>
    </nav>
  );
}