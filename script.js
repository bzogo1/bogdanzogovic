const cursor = document.querySelector(".cursor");
const interactiveEls = document.querySelectorAll(
  "a, button, input, textarea, select, [role='button']"
);

if (cursor && window.matchMedia("(pointer: fine)").matches) {
  const state = {
    x: window.innerWidth / 2,
    y: window.innerHeight / 2,
    tx: window.innerWidth / 2,
    ty: window.innerHeight / 2,
  };

  const updateCursorState = (clientX, clientY) => {
    state.tx = clientX;
    state.ty = clientY;
    cursor.classList.add("is-visible");
  };

  window.addEventListener("pointermove", (event) => {
    updateCursorState(event.clientX, event.clientY);
  });

  window.addEventListener("pointerdown", () => {
    cursor.classList.add("is-active");
  });

  window.addEventListener("pointerup", () => {
    cursor.classList.remove("is-active");
  });

  document.addEventListener("pointerleave", () => {
    cursor.classList.remove("is-visible");
  });

  interactiveEls.forEach((el) => {
    el.addEventListener("mouseenter", () => cursor.classList.add("is-hovering"));
    el.addEventListener("mouseleave", () => cursor.classList.remove("is-hovering"));
  });

  const animateCursor = () => {
    state.x += (state.tx - state.x) * 0.42;
    state.y += (state.ty - state.y) * 0.42;

    cursor.style.setProperty("--cursor-x", `${state.x}px`);
    cursor.style.setProperty("--cursor-y", `${state.y}px`);

    requestAnimationFrame(animateCursor);
  };

  requestAnimationFrame(animateCursor);
}

const contextMenu = document.getElementById("context-menu");

if (contextMenu) {
  const closeContextMenu = () => {
    contextMenu.classList.add("hidden");
    contextMenu.setAttribute("aria-hidden", "true");
  };

  document.addEventListener("contextmenu", (event) => {
    event.preventDefault();

    const menuWidth = 210;
    const menuHeight = 220;
    const x = Math.min(event.clientX + 10, window.innerWidth - menuWidth - 12);
    const y = Math.min(event.clientY + 10, window.innerHeight - menuHeight - 12);

    contextMenu.style.left = `${x}px`;
    contextMenu.style.top = `${y}px`;
    contextMenu.classList.remove("hidden");
    contextMenu.setAttribute("aria-hidden", "false");
  });

  document.addEventListener("click", (event) => {
    if (!event.target.closest(".context-menu")) {
      closeContextMenu();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeContextMenu();
    }
  });

  contextMenu.querySelectorAll(".context-item").forEach((item) => {
    item.addEventListener("click", () => {
      const action = item.dataset.action;

      if (action === "back") {
        window.history.back();
      }

      if (action === "forward") {
        window.history.forward();
      }

      if (action === "reload") {
        window.location.reload();
      }

      if (action === "save-as") {
        const a = document.createElement("a");
        const blob = new Blob([document.documentElement.outerHTML], {
          type: "text/html;charset=utf-8",
        });
        const url = URL.createObjectURL(blob);
        a.href = url;
        a.download = "portfolio-page.html";
        a.click();
        URL.revokeObjectURL(url);
      }

      if (action === "print") {
        window.print();
      }

      if (action === "inspect") {
        document.body.classList.toggle("inspect-mode");
      }

      closeContextMenu();
    });
  });
}

const nav = document.querySelector(".nav");
const navMenu = document.querySelector(".nav-items");
const btnToggleNav = document.querySelector(".menu-btn");
const workEls = document.querySelectorAll(".work-box");
const workImgs = document.querySelectorAll(".work-img");
const mainEl = document.querySelector("main");
const yearEl = document.querySelector(".footer-text span");

const toggleNav = () => {
  nav.classList.toggle("hidden");

  // Prevent screen from scrolling when menu is opened
  document.body.classList.toggle("lock-screen");

  if (nav.classList.contains("hidden")) {
    btnToggleNav.textContent = "menu";
  } else {
    // When menu is opened after transition change text respectively
    setTimeout(() => {
      btnToggleNav.textContent = "close";
    }, 475);
  }
};

btnToggleNav.addEventListener("click", toggleNav);

navMenu.addEventListener("click", (e) => {
  if (e.target.localName === "a") {
  const href = e.target.getAttribute("href");
  if (href?.startsWith("#")) {
      const targetId = href.slice(1);
      const targetEl = document.getElementById(targetId);
      if (targetEl) {
        e.preventDefault();
        targetEl.scrollIntoView({ behavior: "smooth" });
        setTimeout(() => {
          toggleNav();
        }, 500);
        return;
      }
    }
    toggleNav();
  }
});

document.body.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !nav.classList.contains("hidden")) {
    toggleNav();
  }
});

// Animating work instances on scroll

workImgs.forEach((workImg) => workImg.classList.add("transform"));

let observer = new IntersectionObserver(
  (entries) => {
    const [entry] = entries;
    const [textbox, picture] = Array.from(entry.target.children);
    if (entry.isIntersecting) {
      picture.classList.remove("transform");
      Array.from(textbox.children).forEach(
        (el) => (el.style.animationPlayState = "running")
      );
    }
  },
  { threshold: 0.3 }
);

workEls.forEach((workEl) => {
  observer.observe(workEl);
});

// Toggle theme and store user preferred theme for future

const switchThemeEl = document.querySelector('input[type="checkbox"]');
const storedTheme = localStorage.getItem("theme");

switchThemeEl.checked = storedTheme === "dark" || storedTheme === null;

switchThemeEl.addEventListener("click", () => {
  const isChecked = switchThemeEl.checked;

  if (!isChecked) {
    document.body.classList.remove("dark");
    document.body.classList.add("light");
    localStorage.setItem("theme", "light");
    switchThemeEl.checked = false;
  } else {
    document.body.classList.add("dark");
    document.body.classList.remove("light");
    localStorage.setItem("theme", "dark");
  }
});

// Trap the tab when menu is opened

const lastFocusedEl = document.querySelector('a[data-focused="last-focused"]');

document.body.addEventListener("keydown", (e) => {
  if (e.key === "Tab" && document.activeElement === lastFocusedEl) {
    e.preventDefault();
    btnToggleNav.focus();
  }
});

// Rotating logos animation

const logosWrappers = document.querySelectorAll(".logo-group");

const sleep = (number) => new Promise((res) => setTimeout(res, number));

logosWrappers.forEach(async (logoWrapper, i) => {
  const logos = Array.from(logoWrapper.children);
  await sleep(1400 * i);
  setInterval(() => {
    let temp = logos[0];
    logos[0] = logos[1];
    logos[1] = logos[2];
    logos[2] = temp;
    logos[0].classList.add("hide", "to-top");
    logos[1].classList.remove("hide", "to-top", "to-bottom");
    logos[2].classList.add("hide", "to-bottom");
  }, 5600);
});

yearEl.textContent = new Date().getFullYear();
