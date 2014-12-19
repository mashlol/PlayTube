Parse.initialize(
  "3LeDXoXIMPlclj6QhtMExSusuH9TIQcF3XSwkRcC",
  "rFGSoWE3oG7tiEidwu0rsaGYxUH1H35Fc3B7aMPf"
);

var track = function(event, dimensions) {
  Parse.Analytics.track(event, dimensions);
};

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

    if (request.action == "recievePlaylistSongs") {
      $(".section.active .playlist").html("");

      $(".section.active .playlist-full").attr("playlist", request.id);
      $(".section.active .playlist-header .playlist-header-name")
          .text(request.name);

      if (request.songs.length > 0) {
          $(".section.active .playlist-help").hide();
      } else {
          $(".section.active .playlist-help").show();
      }

      for (var x in request.songs) {
        var song = request.songs[x];

        addVideoEle(song, x, $(".section.active .playlist"));
      }

      $(".section.active .playlist-list").hide();
      $(".section.active .playlist").show();
      $(".section.active .playlist-header").show();

      $(".spinner").remove();

      if (!request.background) return;

      var $playlistButton =
          $(".section.active .playlist-list .playlist-button[playlist='"  +
                                                            request.id +
                                                            "']");

      $playlistButton.find(".playlist-button-background").css({
        "background": "url(https://i.ytimg.com/vi/" +
                                        request.background +
                                        "/default.jpg)",
        "background-size": "200%",
        "background-position": "50% 50%",
      });

    }

    if (request.action == "updateSongProgress") {
      $(".location-slider").val(request.amount);

      var opposite = (100 - request.amount) / 100;
      $(".location-slider-left").css({
        width: (request.amount / 100) * 180 + opposite * 7 - 2
      });

      $(".selected-curTime").html(request.curTime);

      if (!$currentVideoEle) return;

      $currentVideoEle.find(".song-progress").css({
        width: request.amount + "%"
      });
      $currentVideoEle.find(".song-curtime").html(request.curTime + " / ");
    }

    if (request.action == "currentVideoUpdate") {
      var video = request.currentVideo;

      var $videoEle =
          getCurrentPlaylistEle().find(".song[video='" + video + "']");
      changeSelectedVideo($videoEle, video, currentPlaylist);
    }

    if (request.action == "addPlaylistEle") {
      $(".playlist-add").before(createPlaylistEle(request.playlist));

      $(".spinner").remove();
    }

    if (request.action == "updatePublicPlaylists") {
      $(".spinner").remove();
      $(".section.browse .playlist-list .playlist-button").remove();

      for (var x in request.playlists) {
        var playlist = request.playlists[x];

        $(".section.browse .playlist-list").append(createPlaylistEle(playlist));
      }
    }
  }
);

var currentVideo;
var currentPlaylist = false;
var $currentVideoEle;
var isPlaying = false;

var getCurrentPlaylistEle = function() {
  if (currentPlaylist === false) {
    var $playlist = $(".section.saved .playlist");
  } else {
    var $playlist =
        $(".playlist-full[playlist='" + currentPlaylist + "'] .playlist");
  }

  return $playlist;
};

var changeSelectedVideo = function($videoEle, video, playlist) {
  isPlaying = true;

  if (currentVideo == video && currentPlaylist === playlist) {
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
  $(".selected-totalTime").html($currentVideoEle.find(".song-duration").html());

  var top = currentVideo * 60 + 72.5;
  getCurrentPlaylistEle().animate({scrollTop: top - 240});
};

var nextVideo = function() {
  sendMessage({action: "next"});
};

var previousVideo = function() {
  sendMessage({action: "previous"});
};

var togglePlayPause = function($videoEle) {
  if ($videoEle.attr("video")) {
    // We clicked on the play button on a song
    var video = $videoEle.attr("video");

    var playlist = $videoEle.parents(".playlist-full").attr("playlist");

    if (!playlist) {
      playlist = false;
    }
  } else {
    // We clicked on the controls button
    var video = currentVideo;
    $videoEle = getCurrentPlaylistEle().find(".song[video='" + video + "']");
    var playlist = currentPlaylist;
  }

  if (currentVideo == video && playlist === currentPlaylist) {
    isPlaying = !isPlaying;
    if (isPlaying) {
      $(".controls .play-pause").html("<i class='fa fa-pause'></i>");
      $videoEle.find(".play-pause").html("<i class='fa fa-pause'></i>");

      sendMessage({action: "play", video: currentVideo, playlist: playlist});
    } else {
      $(".play-pause").html("<i class='fa fa-play'></i>");
      sendMessage({action: "pause"});
    }
  } else {
    changeSelectedVideo($videoEle, video, playlist);

    sendMessage({action: "play", video: currentVideo, playlist: playlist});
  }

  currentPlaylist = playlist;
};

var addVideoEle = function(video, index, $playlistEle) {
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

  var playlist = $playlistEle.parents(".playlist-full").attr("playlist");
  if (currentVideo == index && currentPlaylist == playlist) {
    $currentVideoEle = $newSong;

    $newSong.addClass("selected");
    if (isPlaying) {
      $newSong.find(".play-pause").html("<i class='fa fa-pause'></i>");
    }

    var top = currentVideo * 60 + 72.5;
    getCurrentPlaylistEle().animate({scrollTop: top - 240});
  }

  $playlistEle.append($newSong);

  noVideoCheck();
};

var createPlaylistEle = function(playlist, id, $playlistList) {
  var $playlistBtnEle = $("#templates .playlist-button").clone();
  $playlistBtnEle.find(".playlist-button-title").text(playlist.name);
  $playlistBtnEle.attr("playlist", playlist.id);

  if (playlist.public) {
    $playlistBtnEle.addClass("public");
  }

  if (playlist.background) {
    $playlistBtnEle.find(".playlist-button-background").css({
      "background": "url(https://i.ytimg.com/vi/" +
                                      playlist.background +
                                      "/default.jpg)",
      "background-size": "200%",
      "background-position": "50% 50%",
    });
  }

  return $playlistBtnEle;
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

var noVideoCheck = function() {
  var noVideos = $(".section.saved .playlist .song").length == 0;

  if (!noVideos) {
    $(".help").hide();
  } else {
    $(".help").show();
  }

  return noVideos;
};

var createSpinner = function() {
  var spinner = $("<div>").html('<i class="fa fa-spin fa-spinner"></i>')
          .addClass("spinner")

  $(".sections").append(spinner);
}

$(function() {
  $(".controls .play-pause").on("click", function(event) {
    togglePlayPause($(this));
    track("playPause");
  });

  $(".controls .next").on("click", function(event) {
    nextVideo();
    track("nextVideo");
  });

  $(".controls .previous").on("click", function(event) {
    previousVideo();

    track("previousVideo");
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

    track("shuffleToggle", {isShuffle: "" + isShuffle});
  });

  $(".controls .repeat").on("click", function() {
    $(".controls .repeat").toggleClass("active");

    var isRepeat = $(".controls .repeat").hasClass("active");

    track("repeatToggle", {isRepeat: "" + isRepeat});
  });

  $(".controls .search").on("click", function() {
    $(".search-bar").toggleClass("visible");

    if (!$(".search-bar").hasClass("visible")) {
      $(".search-bar").val('');
      $(".playlist .song").each(function() {
        $(this).show();
      });
    }

    track("searchToggle", {
      visible: "" + $(".search-bar").hasClass("visible")
    });
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

        addVideoEle(
          {
            video: video,
            title: response.title,
            duration: response.duration,
          },
          $(".section.saved .playlist .song").length,
          $(".section.saved .playlist")
        );

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
        $(this).attr("video", $(this).attr("video") - 1);
      }
    });

    sendMessage({action: "remove", video: video});

    noVideoCheck();
  });

  $("body").on("click", ".song .play-pause", function(event) {
    togglePlayPause($(this).parent(".song"));

    track("playPauseSpecific");
  });

  $(".nav-button").on("click", function() {
    var opens = $(this).attr("opens");

    $(".nav-button").removeClass("active");
    $(this).addClass("active");

    $(".section").hide();
    $(".section").removeClass("active");
    $(".section." + opens).show();
    $(".section." + opens).addClass("active");
  });

  $(".playlist-add").on("click", function() {
    $(".new-playlist-name").show();
    $(".new-playlist-name").focus();
  });

  var getPlaylistNameAndClear = function() {
    var name = $(".new-playlist-name").val();
    $(".new-playlist-name").val("");

    $(".new-playlist-name").blur();
    $(".new-playlist-name").hide();

    return name;
  };

  var addPlaylist = function() {
    var name = getPlaylistNameAndClear();

    sendMessage({action: "addPlaylist", name: name});
    createSpinner();
  };

  $(".new-playlist-name").on("blur", getPlaylistNameAndClear);
  $(".new-playlist-name").on("keyup", function(event) {
    if (event.keyCode == 13) {
      addPlaylist();
    }
  });

  $("body").on("click", ".playlist-button", function() {
    var playlist = $(this).attr("playlist");

    if (!playlist) return; // Probably clicked + button

    sendMessage({
      action: "getPlaylistSongs",
      playlist: playlist
    });

    $(".section.active .playlist-list").hide();
    $(".section.active .playlist").show();
    $(".section.active .playlist-header").show();
    $(".section.active .playlist-help").show();

    createSpinner();
  });

  $(".playlist-back").on("click", function() {
    $(".playlist-list").show();

    $(".section.active .playlist").hide();
    $(".section.active .playlist-header").hide();

    if ($(".section.browse .playlist-list").is(":visible")) {
      createSpinner();
      sendMessage({
        action: "browse",
      });
    }
  });

  $(".playlist-edit").on("click", function() {
    $(".playlist-edit").toggleClass("active");

    if ($(".playlist-edit").hasClass("active")) {
      $(".section.playlists .playlist-help").hide();

      // Record all of the video ids in this playlist
      var playlist = [];
      $(".section.playlists .playlist .song").each(function() {
        playlist.push($(this).attr("videoId"));
      });

      // Copy over all the songs from our saved playlist
      $(".section.playlists .playlist").html(
        $(".section.saved .playlist").html()
      );

      $(".section.playlists .playlist .song").each(function() {
        $(this).addClass("song-playlist-edit");
        $(this).removeClass("selected");

        var videoId = $(this).attr("videoId");

        $(this).find(".play-pause")
          .removeClass("play-pause")
          .addClass("playlist-toggle")
          .find("i")
          .removeClass("fa-play")
          .addClass("fa-square-o");

        if (playlist.indexOf(videoId) != -1) {
          $(this).find(".playlist-toggle i")
            .removeClass("fa-square-o")
            .addClass("fa-check-square-o");
        }
      });
    } else {
      sendMessage({
        action: "editModeLeave",
        playlist: $(this).parents(".playlist-full").attr("playlist"),
      });
      createSpinner();
    }
  });

  $("body").on("click", ".playlist-toggle", function() {
    var song = $(this).parent(".song").attr("video");

    $(this).find("i")
      .toggleClass("fa-square-o")
      .toggleClass("fa-check-square-o");

    // If we now are unchecked, remove us from playlist
    if ($(this).find("i").hasClass("fa-square-o")) {
      sendMessage({
        action: "playlistRemoveSong",
        song: song,
        playlist: $(this).parents(".playlist-full").attr("playlist"),
      });
    } else {
      sendMessage({
        action: "playlistAddSong",
        song: song,
        playlist: $(this).parents(".playlist-full").attr("playlist"),
      });
    }
  });

  $("body").on("click", ".playlist-button-options-toggle", function(event) {
    $(".playlist-button-options").removeClass("visible");
    $(this).next(".playlist-button-options").toggleClass("visible");

    event.stopPropagation();
  });

  $("body").on("click", ".playlist-remove", function(event) {
    var $playlistBtn = $(this).parents(".playlist-button")
    var playlist = $playlistBtn.attr("playlist");

    $playlistBtn.remove();

    sendMessage({action: "removePlaylist", playlist: playlist});

    event.stopPropagation();
  });

  $("body").on("click", ".playlist-rename", function(event) {
    $(this).parents(".playlist-button-options").removeClass("visible");

    var $playlistBtn = $(this).parents(".playlist-button")
    var playlist = $playlistBtn.attr("playlist");

    var $nameEle = $playlistBtn.find(".playlist-button-title");

    var name = $nameEle.text();

    $nameEle.remove();

    var $inputEle = $("<input />").attr("type", "name").val(name).css({
      display: "block",
    });
    $playlistBtn.append($inputEle);

    $inputEle.focus();

    $inputEle.on("blur", function() {
      $inputEle.remove();

      $playlistBtn.append($nameEle);
    });

    $inputEle.on("keyup", function(event) {
      if (event.keyCode == 13) {
        var newName = $(this).val();

        sendMessage({
          action: "renamePlaylist",
          playlist: playlist,
          name: newName,
        });

        $inputEle.remove();

        $nameEle.text(newName);
        $playlistBtn.append($nameEle);
      }
    });

    event.stopPropagation();
  });

  $("body").on("click", ".playlist-make-public", function(event) {
    var $playlistBtnEle = $(this).parents(".playlist-button");

    sendMessage({
      action: "playlistChangePublic",
      playlist: $playlistBtnEle.attr("playlist"),
      public: true,
    });

    $playlistBtnEle.addClass("public");

    event.stopPropagation();
  });

  $("body").on("click", ".playlist-make-private", function(event) {
    var $playlistBtnEle = $(this).parents(".playlist-button");

    sendMessage({
      action: "playlistChangePublic",
      playlist: $playlistBtnEle.attr("playlist"),
      public: false,
    });

    $playlistBtnEle.removeClass("public");

    event.stopPropagation();
  });

  $(".playlist-list .playlist-list-search input").on("input", function() {
    var query = $(this).val().toLowerCase();

    var $siblings =
        $(this).parent(".playlist-list-search").siblings(".playlist-button");

    $siblings.each(function() {
      var playlistName =
          $(this).find(".playlist-button-title").text().toLowerCase();
      if (playlistName.indexOf(query) == -1) {
        $(this).hide();
      } else {
        $(this).show();
      }
    });
  });

  $("body").on("click", function() {
    $(".playlist-button-options").removeClass("visible");
  });

  $(".nav-button[opens='browse']").on("click", function() {
    if ($(".section.browse .playlist-list").is(":visible")) {
      createSpinner();
      sendMessage({
        action: "browse",
      });
    }
  });

  // Get what the current state is
  sendMessage({action: "state"}, function(response) {
    for (var x in response.playlists) {
      var playlist = response.playlists[x];

      // If its a public playlist, ignore it
      if (!playlist.owned) {
        continue;
      }

      $(".playlist-add").before(createPlaylistEle(playlist));
    }

    for (var x in response.videos) {
      var video = response.videos[x];

      addVideoEle(video, x, $(".section.saved .playlist"));
    }

    isPlaying = response.isPlaying;

    chrome.tabs.getSelected(null, function(tab) {
      var video = getVideoIdFromUrl(tab.url);

      if (!video) {
        return;
      }

      if (isVideoAlreadySaved(video)) {
        $(".add").html("<i class='fa fa-check'></i>");
      }
    });

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

    if (noVideoCheck()) {
      return;
    }

    $(".selected-title").html(response.currentTitle);
    $(".selected-totalTime").html(response.currentDuration);

    if (isPlaying) {
      $(".controls .play-pause").html("<i class='fa fa-pause'></i>");
    }

    currentVideo = response.currentVideo;
    currentPlaylist = response.currentPlaylist;

    if (currentPlaylist !== false) {
      $(".nav-button").removeClass("active");
      $(".section").hide();
      $(".section").removeClass("active");

      if (response.playlists[currentPlaylist].owned) {
        $(".nav-button[opens='playlists']").addClass("active");

        $(".section.playlists").show();
        $(".section.playlists").addClass("active");
      } else {
        $(".nav-button[opens='browse']").addClass("active");

        $(".section.browse").addClass("active");
        $(".section.browse").show();
      }

      // Request to get this playlists songs
      sendMessage({
        action: "getPlaylistSongs",
        playlist: currentPlaylist
      });
      createSpinner();

      return;
    }

    $currentVideoEle =
        getCurrentPlaylistEle().find(".song[video='" + currentVideo + "']");

    if (isPlaying) {
      $currentVideoEle.find(".play-pause").html("<i class='fa fa-pause'></i>");
    }
    $currentVideoEle.addClass("selected");

    var top = $currentVideoEle.offset().top;
    getCurrentPlaylistEle().animate({scrollTop: top - 240});
  });
});
