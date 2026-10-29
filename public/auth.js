import { $, api, status, el, button } from "./ui.js";
const panel = el("section", undefined, $("main"));
$("main").prepend(panel);
panel.innerHTML = `<form id="auth"><h2>Open your workspace</h2><label>Name (new accounts)<input name="name" autocomplete="name"></label><label>Email<input name="email" type="email" autocomplete="username" required></label><label>Password<input name="password" type="password" minlength="8" maxlength="128" autocomplete="current-password" required></label><button name="action" value="login">Sign in</button><button name="action" value="register">Create account</button></form><div id="account"></div>`;
function hideWorkspace(hide) {
  for (const id of ["tools", "workspace", "notes"]) $("#" + id).hidden = hide;
}
hideWorkspace(true);
async function ready(user) {
  window.currentUser = user;
  $("#auth").hidden = true;
  hideWorkspace(false);
  $("#account").replaceChildren();
  el("p", "Signed in as " + user.name, $("#account"));
  button(
    "Sign out",
    async () => {
      await api("/api/logout", "POST", {});
      localStorage.removeItem("brain-user");
      location.reload();
    },
    $("#account"),
  );
  localStorage.setItem("brain-user", JSON.stringify(user));
  window.dispatchEvent(new Event("brain-ready"));
}
$("#auth").onsubmit = async (e) => {
  e.preventDefault();
  try {
    await ready(
      await api(
        "/api/auth/" + e.submitter.value,
        "POST",
        Object.fromEntries(new FormData(e.target)),
      ),
    );
  } catch (e) {
    status(e.message);
  }
};

api("/api/me")
  .then(ready)
  .catch(() => {
    status("Sign in online, or open your previously saved local workspace.");
    const remembered = JSON.parse(localStorage.getItem("brain-user") || "null");
    if (remembered)
      button(
        "Open local workspace: " + remembered.name,
        () => ready(remembered),
        $("#account"),
      );
  });
