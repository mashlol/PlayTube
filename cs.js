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
    .innerHTML;
  chrome.runtime.sendMessage({
    action: "updateSongProgress",
    amount: scaleNum * 100,
    curTime: curTime
  });
};

setInterval(looper, 400);

var isPlayTab = false;
var volume = 0;

chrome.runtime.onMessage.addListener(
  function(request, sender, sendResponse) {
    if (request.action == "clickVideo") {
      document.getElementsByClassName("html5-video-container")[0].click();
    }

    if (request.action == "getVideoInfo") {
      sendResponse({
        title: document.getElementById("eow-title").innerHTML.trim(),
        duration: document.getElementsByClassName("ytp-time-duration")[0]
                      .innerHTML.trim(),
      });
    }

    if (request.action == "updateVolume") {
      volume = request.volume;
      if (isPlayTab) {
        document.getElementsByClassName("video-stream")[0].volume = volume / 100;
      }
    }

    if (request.action == "updateLocation") {
      if (isPlayTab) {
        var location = request.location;
        var duration = document.getElementsByClassName("video-stream")[0].duration;

        document.getElementsByClassName("video-stream")[0].currentTime =
            duration * (location / 100);
      }
    }
  }
);


chrome.runtime.sendMessage({action: "isPlayTab"}, function(response) {
  isPlayTab = response.isPlayTab;
  if (isPlayTab) {
    document.getElementsByClassName("video-stream")[0].volume =
          response.volume / 100;
  }
});
