// assets/js/auth.js

import { auth, db } from "./firebase-config.js";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";

import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

/* =====================================================
   Helpers
===================================================== */

function redirectByRole(role) {
  let target = "";

  if (role === "worker") {
    target = "dashboard-worker.html";
  } else if (role === "client") {
    target = "dashboard-client.html";
  } else if (role === "admin") {
    // 👈 nombre correcto de tu dashboard admin
    target = "admin-dashboard.html";
  } else {
    // Rol desconocido → lo tratamos como pendiente
    window.location.href = "account-pending.html";
    return;
  }

  window.location.href = target;
}

async function getUserProfile(uid) {
  const ref = doc(db, "users", uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return snap.data();
}

/* =====================================================
   LOGIN
===================================================== */

const loginForm = document.getElementById("login-form");
const loginErrorEl = document.getElementById("login-error");

if (loginForm) {
  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (loginErrorEl) loginErrorEl.textContent = "";

    const email = document.getElementById("login-email").value.trim();
    const password = document.getElementById("login-password").value;

    try {
      const cred = await signInWithEmailAndPassword(auth, email, password);
      const uid = cred.user.uid;

      // Buscar perfil en Firestore
      let profile = await getUserProfile(uid);

      // Si no existe documento, creamos uno "pending" mínimo
      if (!profile) {
        profile = {
          uid,
          email: cred.user.email,
          role: "pending",
          createdAt: serverTimestamp()
        };
        await setDoc(doc(db, "users", uid), profile);
      }

      // Si está pendiente → página de cuenta pendiente
      if (profile.role === "pending") {
        window.location.href = "account-pending.html";
        return;
      }

      // Si tiene rol válido → dashboard correspondiente
      redirectByRole(profile.role);
    } catch (err) {
      console.error("LOGIN ERROR:", err.code, err.message);
      if (loginErrorEl) {
        if (err.code === "auth/user-not-found" || err.code === "auth/wrong-password") {
          loginErrorEl.textContent = "Incorrect email or password.";
        } else {
          loginErrorEl.textContent = "Error signing in. Please try again.";
        }
      }
    }
  });
}

/* =====================================================
   SIGNUP (Request access)
===================================================== */

const signupForm = document.getElementById("signup-form");
const signupErrorEl = document.getElementById("signup-error");
const signupSuccessEl = document.getElementById("signup-success");
const signupSubmitBtn = document.getElementById("signup-submit");

function showSignupError(msg) {
  if (signupErrorEl) signupErrorEl.textContent = msg || "";
  if (signupSuccessEl) signupSuccessEl.textContent = "";
}

function showSignupSuccess(msg) {
  if (signupSuccessEl) signupSuccessEl.textContent = msg || "";
  if (signupErrorEl) signupErrorEl.textContent = "";
}

if (signupForm) {
  signupForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    showSignupError("");
    showSignupSuccess("");

    const fullNameInput = document.getElementById("signup-name");
    const emailInput = document.getElementById("signup-email");
    const passwordInput = document.getElementById("signup-password");
    const roleSelect = document.getElementById("signup-role");

    const fullName = fullNameInput.value.trim();
    const email = emailInput.value.trim();
    const password = passwordInput.value;
    const requestedRole = roleSelect.value;

    if (!fullName || !email || !password || !requestedRole) {
      showSignupError("Please fill in all fields.");
      return;
    }

    if (password.length < 6) {
      showSignupError("Password must be at least 6 characters.");
      return;
    }

    if (signupSubmitBtn) {
      signupSubmitBtn.disabled = true;
      signupSubmitBtn.textContent = "Creating account…";
    }

    try {
      // 1. Crear usuario en Authentication
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      const uid = cred.user.uid;

      // 2. Crear perfil en Firestore con role "pending"
      await setDoc(doc(db, "users", uid), {
        uid,
        email,
        fullName,
        requestedRole,      // worker / client que pidió
        role: "pending",    // hasta que tú lo apruebes en admin
        createdAt: serverTimestamp()
      });

      // 3. Llevar a pantalla de cuenta pendiente
      window.location.href = "account-pending.html";
    } catch (err) {
      console.error("SIGNUP ERROR:", err.code, err.message);
      if (err.code === "auth/email-already-in-use") {
        showSignupError("This email is already in use. Try logging in instead.");
      } else if (err.code === "auth/weak-password") {
        showSignupError("Password is too weak. Use at least 6 characters.");
      } else {
        showSignupError("Error creating account. Please try again.");
      }
    } finally {
      if (signupSubmitBtn) {
        signupSubmitBtn.disabled = false;
        signupSubmitBtn.textContent = "Create Account";
      }
    }
  });
}

/* =====================================================
   LOGOUT (botón con id="logout-btn")
===================================================== */

const logoutBtn = document.getElementById("logout-btn");
if (logoutBtn) {
  logoutBtn.addEventListener("click", async () => {
    try {
      await signOut(auth);
    } catch (err) {
      console.error("LOGOUT ERROR:", err.code, err.message);
    } finally {
      window.location.href = "login.html";
    }
  });
}

/* =====================================================
   PROTECCIÓN DE PÁGINAS & AUTO-REDIRECCIÓN
===================================================== */

onAuthStateChanged(auth, async (user) => {
  const currentPage = window.location.pathname.split("/").pop() || "index.html";

  // Páginas que requieren estar logueado
  const protectedPages = [
    "dashboard-worker.html",
    "dashboard-client.html",
    "admin-dashboard.html",        // admin principal
    "admin-timesheets.html",       // admin de timesheets
    "admin-flhas.html",            // admin de FLHAs
    "admin-quotes-invoce.html",    // listado de quotes/invoices
    "timesheets.html",
    "worker-timesheet-form.html",
    "flha.html",
    "quote.html",                  // nueva página de quote
    "invoice.html"                 // nueva página de invoice
  ];

  // Si NO hay usuario y está en página protegida → mandar a login
  if (!user && protectedPages.includes(currentPage)) {
    window.location.href = "login.html";
    return;
  }

  // Si NO hay usuario y está en account-pending → mandar a login
  if (!user && currentPage === "account-pending.html") {
    window.location.href = "login.html";
    return;
  }

  // Si hay usuario, podemos ajustar redirecciones automáticas:
  if (user) {
    // Si está en login o signup y ya tiene rol aprobado → mandarlo a dashboard
    if (currentPage === "login.html" || currentPage === "signup.html") {
      try {
        const profile = await getUserProfile(user.uid);
        if (!profile) {
          // Si no hay perfil, lo dejamos, o podrías mandarlo a pending
          return;
        }

        if (profile.role === "pending") {
          window.location.href = "account-pending.html";
          return;
        }

        redirectByRole(profile.role);
      } catch (err) {
        console.error("AUTH STATE ERROR:", err.code, err.message);
      }
    }

    // Si está en account-pending pero ya cambiaste su rol en Firestore → mandarlo al dashboard
    if (currentPage === "account-pending.html") {
      try {
        const profile = await getUserProfile(user.uid);
        if (profile && profile.role !== "pending") {
          redirectByRole(profile.role);
        }
      } catch (err) {
        console.error("PENDING CHECK ERROR:", err.code, err.message);
      }
    }
  }
});