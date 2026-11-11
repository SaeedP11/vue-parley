# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

## [5.5.22] - 2026-11-11

### Fixed

- A shared screen no longer turns black when it moves between the main view and the participant strip: each stream keeps one `<video>` that moves with it, so an idle screen, which sends no new frames, still shows its picture.

## [5.5.21] - 2026-11-11

### Added

- E2E coverage for switching the main call view between participants and a shared screen.

## [5.5.20] - 2026-11-10

### Added

- Media viewer: zoom in/out buttons (and `+`/`-` keys) for photos, and a tap or click beside the photo closes it.
- The viewer steps through every photo and video loaded in the conversation, not only the opened message's album; the top bar shows each item's own sender and date.

### Fixed

- A photo smaller than the screen opened at its own pixel size in the viewer, smaller than its chat bubble; it is now scaled up to fit.
- The viewer is teleported to `<body>`, so it now carries the chat's direction itself (RTL arrows and header).

## [5.5.19] - 2026-11-10

### Added

- The minimized call window lists the participants; picking one switches whose video it shows, and the pick survives maximize/minimize.

## [5.5.18] - 2026-11-10

### Changed

- On phones the call bar keeps only microphone, camera and end call; flip camera, screen share, the host action and host controls open from a new "More" button.

## [5.5.17] - 2026-11-10

### Fixed

- Every call participant gets the share-screen button when the host enables `screenShare`; a device that can't share says so when tapped instead of hiding the button.
- Someone who joins while a screen share is running now sees it as a screen tile, next to the sharer's camera, instead of in place of the camera.

## [5.5.15] - 2026-11-10

### Added

- Video player displays loading state and download percentage when video chunks or fallback blobs are loading.
- Timeline seekbar renders multi-segment buffered ranges.
- BubbleVideo message bubbles show an unobtrusive buffering spinner during chunk loading.

## [5.5.13] - 2026-11-10

### Fixed

- Call control labels wrap on narrow phones instead of running into the neighbouring control.

## [5.5.12] - 2026-11-10

### Added

- Call tiles zoom with the mouse wheel or a pinch, pan by dragging, and reset with a double click or the reset button.

## [5.5.11] - 2026-11-10

### Fixed

- A touch phone held in landscape keeps the mobile chat layout instead of the cramped desktop split view.

## [5.5.10] - 2026-11-09

### Added

- Calls can share a screen, move the shared screen between the main stage and a tile, and open participant tiles full-screen.
- Conversations are grouped by recent date, and call controls can remain visible but disabled with an availability reason.

### Fixed

- New messages preserve the reader's position while scrolled up and follow messages when already near the newest item.
