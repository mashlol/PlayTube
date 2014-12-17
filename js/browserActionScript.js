var sendMessage = function(message, callback) {
  chrome.runtime.sendMessage(message, callback);
};

chrome.runtime.onMessage.addListener(
  function(request, sender, sendResponse) {
    if (request.action == "update") {
      isPlaying = request.isPlaying;
      if (isPlaying) {
        $currentVideoEle.find(".play-pause")
            .html("<i class='fa fa-pause'></i>");
        $(".controls .play-pause").html("<i class='fa fa-pause'></i>");
      } else {
        $(".play-pause").html("<i class='fa fa-play'></i>");
      }
    }

    if (request.action == "updateSongProgress") {
      $currentVideoEle.find(".song-progress").css({
        width: request.amount + "%"
      });

      $(".location-slider").val(request.amount);

      var opposite = (100 - request.amount) / 100;
      $(".location-slider-left").css({
        width: (request.amount / 100) * 180 + opposite * 7 - 2
      });

      $currentVideoEle.find(".song-curtime").html(request.curTime + " / ");

      $(".selected-length").html(request.curTime + " / " +
            $currentVideoEle.find(".song-duration").html());
    }

    if (request.action == "currentVideoUpdate") {
      var video = request.currentVideo;

      var $videoEle = $(".song[video='" + video + "']");
      changeSelectedVideo($videoEle, video);
    }
  }
);

var currentVideo;
var $currentVideoEle;
var isPlaying = false;

var changeSelectedVideo = function($videoEle, video) {
  isPlaying = true;

  if (currentVideo == video) {
    return;
  }

  if ($currentVideoEle) {
    $currentVideoEle.find(".play-pause").html("<i class='fa fa-play'></i>");
    $currentVideoEle.removeClass("selected");
  }
  currentVideo = video;
  $currentVideoEle = $videoEle;
  $currentVideoEle.addClass("selected");
  $videoEle.find(".play-pause").html("<i class='fa fa-pause'></i>");
  $(".controls .play-pause").html("<i class='fa fa-pause'></i>");

  $(".song-progress").css({
    width: "0%"
  });
  $(".song-curtime").html("");

  $(".selected-title").html($currentVideoEle.find(".song-title").html());

  var top = currentVideo * 60 + 72.5;
  $(".playlist").animate({scrollTop: top - 240});
};

var nextVideo = function() {
  sendMessage({action: "next"});
};

var previousVideo = function() {
  sendMessage({action: "previous"});
};

var togglePlayPause = function($videoEle) {
  if ($videoEle.attr("video")) {
    var video = $videoEle.attr("video");
  } else {
    var video = currentVideo;
    $videoEle = $(".song[video='" + video + "']");
  }

  if (currentVideo == video) {
    isPlaying = !isPlaying;
    if (isPlaying) {
      $(".controls .play-pause").html("<i class='fa fa-pause'></i>");
      $videoEle.find(".play-pause").html("<i class='fa fa-pause'></i>");
      sendMessage({action: "play", video: currentVideo});
    } else {
      $(".play-pause").html("<i class='fa fa-play'></i>");
      sendMessage({action: "pause"});
    }
  } else {
    changeSelectedVideo($videoEle, video);

    sendMessage({action: "play", video: currentVideo});
  }
};

var addVideoEle = function(video, index) {
  $newSong = $("#templates .song").clone();

  $newSong.find(".song-title").html(video.title);
  $newSong.find(".song-duration").html(video.duration);


  $newSong.find(".background").css({
    "background": "url(https://i.ytimg.com/vi/" + video.video + "/default.jpg)",
    "background-size": "120%",
    "background-position-y": "50%",
    "background-position-x": "50%",
  });

  $newSong.attr("video", index);
  $newSong.attr("videoId", video.video);

  $(".playlist").append($newSong);
};

var isVideoAlreadySaved = function(videoId) {
  for (var x = 0; x < $(".playlist .song").length; x++) {
    if ($(".playlist .song").eq(x).attr("videoId") == videoId) {
      return true;
    }
  }

  return false;
};

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

$(function() {
  $(".controls .play-pause").on("click", function(event) {
    togglePlayPause($(this));
  });

  $(".controls .next").on("click", function(event) {
    nextVideo();
  });

  $(".controls .previous").on("click", function(event) {
    previousVideo();
  });

  $(".controls .volume-slider").on("input", function(event) {
    var val = $(".controls .volume-slider").val();
    sendMessage({
      action: "updateVolume",
      volume: val,
    });

    var opposite = (100 - val) / 100;
    $(".volume-slider-left").css({
      width: (val / 100) * 80 + opposite * 7 - 2
    });
  });

  $(".controls .location-slider").on("change", function() {
    sendMessage({
      action: "updateLocation",
      location: $(".controls .location-slider").val()
    });
  });

  $(".controls .shuffle").on("click", function() {
    $(".controls .shuffle").toggleClass("active");
    var isShuffle = $(".controls .shuffle").hasClass("active");

    sendMessage({
      action: "shuffleToggle",
      isShuffle: isShuffle,
    });
  });

  $(".controls .repeat").on("click", function() {
    $(".controls .repeat").toggleClass("active");

    var isRepeat = $(".controls .repeat").hasClass("active");


  });

  $(".controls .search").on("click", function() {
    $(".search-bar").toggleClass("visible");

    if (!$(".search-bar").hasClass("visible")) {
      $(".search-bar").val('');
      $(".playlist .song").each(function() {
        $(this).show();
      });
    }
  });

  $(".search-bar").on("input", function() {
    var query = $(".search-bar").val().toLowerCase();
    $(".playlist .song").each(function() {
      var songName = $(this).find(".song-title").html().toLowerCase();
      if (songName.indexOf(query) == -1) {
        $(this).hide();
      } else {
        $(this).show();
      }
    });
  });

  $(".controls .add").on("click", function(event) {
    chrome.tabs.getSelected(null, function(tab) {
      var video = getVideoIdFromUrl(tab.url);

      if (!video) {
        return;
      }

      if (isVideoAlreadySaved(video)) {
        return;
      }

      chrome.tabs.sendMessage(tab.id, {
        action: "getVideoInfo",
      }, function(response) {
        sendMessage({
          action: "add",
          video: video,
          title: response.title,
          duration: response.duration,
        });

        addVideoEle({
          video: video,
          title: response.title,
          duration: response.duration,
        }, $(".playlist .song").length);

        $(".add").html("<i class='fa fa-check'></i>");
      });
    });
  });

  $("body").on("click", ".song .song-remove", function(event) {
    var $videoEle = $(this).parent(".song");
    var video = $videoEle.attr("video");

    // We should stop playing - we're removing the current song
    if (currentVideo == video && isPlaying) {
      sendMessage({action: "pause"});
      $(".play-pause").html("<i class='fa fa-play'></i>");
      isPlaying = false;
    }

    if (currentVideo > video) {
      currentVideo--;
    }

    $videoEle.remove();

    $(".song").each(function() {
      if ($(this).attr("video") > video) {
        $(this).attr("video", $(this).attr("video") - 1)
      }
    });

    sendMessage({action: "remove", video: video});
  });

  $("body").on("click", ".song .play-pause", function(event) {
    togglePlayPause($(this).parent(".song"));
  });

  // Get what the current state is
  sendMessage({action: "state"}, function(response) {
    for (var x in response.videos) {
      var video = response.videos[x];

      addVideoEle(video, x);
    }

    isPlaying = response.isPlaying;
    currentVideo = response.currentVideo;
    $currentVideoEle = $(".song[video='" + currentVideo + "']");

    if (isPlaying) {
      $(".controls .play-pause").html("<i class='fa fa-pause'></i>");
      $currentVideoEle.find(".play-pause").html("<i class='fa fa-pause'></i>");
    }

    $currentVideoEle.addClass("selected");

    chrome.tabs.getSelected(null, function(tab) {
      var video = getVideoIdFromUrl(tab.url);

      if (!video) {
        return;
      }

      if (isVideoAlreadySaved(video)) {
        $(".add").html("<i class='fa fa-check'></i>");
      }
    });

    var top = $currentVideoEle.offset().top;
    $(".playlist").animate({scrollTop: top - 240});

    $(".selected-title").html($currentVideoEle.find(".song-title").html());

    $(".controls .volume-slider").val(response.volume);
    var opposite = (100 - response.volume) / 100;
    $(".volume-slider-left").css({
      width: (response.volume / 100) * 80 + opposite * 7 - 2
    });

    if (response.isRepeat) {
      $(".controls .repeat").addClass("active");
    }

    if (response.isShuffle) {
      $(".controls .shuffle").addClass("active");
    }
  });
});
