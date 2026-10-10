/*
 * RHIPO Studio inquiry form embed. Paste on any website:
 *   <div id="rhipo-inquiry"></div>
 *   <script src="https://YOUR-APP-DOMAIN/embed.js" async></script>
 */
(function () {
  var script = document.currentScript;
  if (!script) return;
  var origin = new URL(script.src).origin;
  var target = document.getElementById("rhipo-inquiry");
  if (!target) {
    target = document.createElement("div");
    script.parentNode.insertBefore(target, script);
  }
  var frame = document.createElement("iframe");
  frame.src = origin + "/f/inquiry?embed=1";
  frame.title = "Wedding inquiry form";
  frame.loading = "lazy";
  frame.style.cssText = "width:100%;border:0;min-height:900px;display:block;background:transparent";
  target.appendChild(frame);
  window.addEventListener("message", function (event) {
    if (event.origin !== origin || event.source !== frame.contentWindow) return;
    var data = event.data || {};
    if (data.type === "rhipo-form-height" && typeof data.height === "number") {
      frame.style.minHeight = "0";
      frame.style.height = Math.min(Math.max(data.height, 300), 5000) + "px";
    }
  });
})();
