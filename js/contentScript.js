var getVideoIdFromUrl = function(url) {
  if (url.indexOf("youtube.com") == -1) {
    return false;
  }

  var start = url.indexOf("v=");
  var end = url.indexOf("&", start);

  var video;
  if (end == -1) {
    video = url.substr(start+2);
  } else {
    video = url.substring(start+2, end);
  }

  return video;
};

var looper = function() {
  if (!isPlayTab) {
    return;
  }

  if (document.getElementsByClassName("ytp-button-replay").length) {
    chrome.runtime.sendMessage({action: "songEnded"});
  }

  var scale = document.getElementsByClassName("ytp-play-progress")[0]
    .style.transform.substr(7, 17);
  var scaleNum = parseFloat(scale);
  var curTime = document.getElementsByClassName("ytp-time-current")[0]
    .innerText;
  chrome.runtime.sendMessage({
    action: "updateSongProgress",
    amount: scaleNum * 100,
    curTime: curTime
  });

  document.getElementsByClassName("video-stream")[0].volume =
      volume / 100;
};

setInterval(looper, 400);

var animFrame = function() {
  // requestAnimationFrame(animFrame);

  if (!isPlayTab) {
    return;
  }

  ctx.drawImage(document.getElementsByClassName("video-stream")[0],
    0,
    0,
    300,
    150
  );

  chrome.runtime.sendMessage({
    action: "videoDataInfo",
    data: canvas.toDataURL("image/png"),
  });
};

// setInterval(animFrame, 17);

var isPlayTab = false;
var volume = 50;

var playButton;
var canvas;
var ctx;

chrome.runtime.onMessage.addListener(
  function(request, sender, sendResponse) {
    if (request.action == "clickVideo") {
      playButton.click();
    }

    if (request.action == "getVideoInfo") {
      sendResponse({
        title: document.getElementById("eow-title").innerText.trim(),
        duration: document.getElementsByClassName("ytp-time-duration")[0]
                      .innerText.trim(),
      });
    }

    if (request.action == "updateVolume") {
      volume = request.volume;
      if (isPlayTab) {
        document.getElementsByClassName("video-stream")[0].volume =
            volume / 100;
      }
    }

    if (request.action == "updateLocation") {
      if (isPlayTab) {
        var location = request.location;
        var duration =
            document.getElementsByClassName("video-stream")[0].duration;

        document.getElementsByClassName("video-stream")[0].currentTime =
            duration * (location / 100);
      }
    }

    if (request.action == "urlChanged") {
      setTimeout(function() {
        addSaveButton();
      }, 1500);
    }

    if (request.action == "tick") {
      animFrame();
    }
  }
);

chrome.runtime.sendMessage({action: "isPlayTab"}, function(response) {
  isPlayTab = response.isPlayTab;
  if (isPlayTab) {
    volume = response.volume;
    document.getElementsByClassName("video-stream")[0].volume =
          response.volume / 100;
    playButton = document.getElementsByClassName("ytp-button-pause")[0];

    canvas = document.createElement("canvas");
    ctx = canvas.getContext('2d');
  }
});

var addSaveButton = function() {
  if (document.getElementById("pt-save-button")) {
    return;
  }

  if (window.location.host.indexOf("youtube") != -1
            && window.location.pathname == "/watch") {

    var videoId = getVideoIdFromUrl(window.location.href);

    chrome.runtime.sendMessage({
        action: "isVideoAlreadySaved",
        videoId: videoId
      }, function(response) {
        var hasSaved = false;

        var btn = document.createElement("button");
        btn.style.height = "28px";
        btn.style.background = "#167ac6";
        btn.style.float = "right";
        btn.style.color = "white";
        btn.style.cursor = "pointer";
        btn.style.padding = "0 10px";

        btn.id = "pt-save-button";

        btn.onmouseover = function() {
          btn.style.background = "#2793e6";
        };

        btn.onmouseout = function() {
          btn.style.background = "#167ac6";
        };

        document.getElementById("watch-headline-title").appendChild(btn);

        if (!response) {
          btn.innerHTML = "✚ &nbsp;Save";

          btn.onclick = function() {
            if (hasSaved) return;

            chrome.runtime.sendMessage({
              action: "add",
              video: videoId,
              title: document.getElementById("eow-title").innerText.trim(),
              duration: document.getElementsByClassName("ytp-time-duration")[0]
                            .innerText.trim(),
              shortcut: true,
            });
            btn.innerHTML = "✓ &nbsp;Saved";
            hasSaved = true;
          };
        } else {
          btn.innerHTML = "✓ &nbsp;Saved";
        }
    });
  }
};

addSaveButton();
