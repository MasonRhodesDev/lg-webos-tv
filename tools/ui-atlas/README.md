# webOS UI Atlas

Builds a single-page catalog of the TV's GUI: home ribbon, input banner and picker, Quick Settings, volume OSD, toasts, Settings, Notification Center, hotkey popup, live menu, Homebrew Channel, AirPlay, Google Assistant, virtual keyboard, and screen saver. Each tab covers one element and shows:

- what it looks like;
- where it is stored on the eMMC and how big it is;
- how it reaches the screen (web app, QML app, or compositor);
- which luna services it calls, and its ACL entries.

Everything comes from a backup taken with [`scripts/backup.sh`](../../scripts/backup.sh). Nothing touches the TV.

The page is one `index.html` with an `img/` and a `fonts/` directory next to it. It loads nothing from the network except Google Fonts.

## Don't commit the output

The output contains LG's copyrighted images and fonts, copied out of the firmware. Screenshots, if you add them, show your own screen. `.gitignore` excludes the usual locations: `tools/ui-atlas/out/`, `tools/ui-atlas/.local/`, the intermediate JSON files, and image and font files under `tools/ui-atlas/`. Build into a directory outside the repo, or into one of those ignored paths.

## Inputs

You pass `BACKUP_DIR`, which is one `scripts/backup.sh` output directory: the one that holds `images/`, `files/` and `runtime/`. The script only reads it. From it the script uses:

| Input | Used for |
|---|---|
| `images/s*_<rootfs>.img` | Active rootfs (squashfs). Almost everything: app bundles, QML, ACLs, images. |
| `images/s*_<otncabi>.img` | `/mnt/otncabi` (squashfs). Only the LG Content Store icon. |
| `files/media_developer.tar` | Homebrew Channel app and service. |
| `runtime/proc_cmdline.txt` | Which partition is the rootfs (`root=`). Override with `ROOTFS_PART`. |
| `runtime/proc_mounts.txt` | Which partition is mounted on `/mnt/otncabi`. Override with `OTNCABI_PART`. |

On the B9 these were documented on, the rootfs is `mmcblk0p28` and otncabi is `mmcblk0p31`. The other slot of the A/B pair will be active after an update, which is why the script reads the partition names from the runtime capture.

## Tools

Required:

- a POSIX `sh` and the usual coreutils (`mktemp`, `cp`, `sed`, `awk`, `tr`);
- `unsquashfs` (squashfs-tools);
- `tar`;
- `python3` 3.8 or later, standard library only.

Optional:

- Chromium or Chrome, only for `--capture-hbc`. The script looks for `chromium`, `chromium-browser`, `google-chrome` and `google-chrome-stable` on `PATH`, or you can set `CHROMIUM=/path/to/binary`.

The work dir is about 1.5 GB. It is created under `$TMPDIR` (default `/tmp`) and deleted on exit.

## Run

```sh
tools/ui-atlas/build.sh --capture-hbc /path/to/backup/YYYY-MM-DD tools/ui-atlas/out
# open tools/ui-atlas/out/index.html
```

| Option | Effect |
|---|---|
| `--capture-hbc` | Runs the Homebrew Channel app once in headless Chromium, with DNS and the proxy pointed at nothing, and keeps the resulting DOM. The copy is cached in `OUT_DIR/.cache/hbc_dom.html`. |
| `--hbc-dom FILE` | Uses a saved DOM capture instead of running Chromium. |
| `--shots DIR` | Adds real screenshots. See [Screenshots](#screenshots). |
| `--keep-work` | Keeps the extracted work dir, for debugging, and prints its path. |

If you don't pass `--capture-hbc` or `--hbc-dom`, the script uses `OUT_DIR/.cache/hbc_dom.html` if a previous run left one there. If there is no copy, it skips the Homebrew Channel preview and says so on the page. The cache is kept out of git like the rest of the output.

## Pipeline

1. **Extract.** `unsquashfs` extracts the rootfs and otncabi images, and `tar` extracts `media/developer/apps` from the developer tar.
2. **`collect.py WORK facts.json`** gathers facts for each element by walking the extracted trees:
   - on-disk sizes and file counts;
   - `luna://` URIs;
   - `service`/`method` pairs from the QML and JS;
   - matching luna-service2 role, permission and manifest files;
   - `appinfo.json`.
3. **`prep_srcdoc.py WORK srcdoc.json [HBC_DOM]`** turns the app markup that ships on disk into self-contained `srcdoc` documents (see Real markup below). It removes every `<script>` and inline handler. It re-points LG's unshipped fonts (LG Display, Museo Sans) at Google's Nunito Sans, masks dingbat glyphs, and drops any remote image. It fails if anything other than Google Fonts would load.
4. **Assets.** [`assets.tsv`](assets.tsv) maps each published `img/` and `fonts/` path to its source file inside the extracted images. When the same file ships in several places, it names the app the asset belongs to.
5. **`build.py WORK OUT_DIR`** writes `index.html`. It takes the tab content from its own source, the numbers from `facts.json`, the previews from `srcdoc.json`, and the styles and script from `page.css` and `page.js`.

The prose in `build.py` is research notes about the specific 2026-10-25 backup of an LG B9 (webOS 4.5, firmware 05.40.45): boot timings, CRIU image dates, partition roles. A different backup refreshes the computed tables and the copied assets, but not those notes.

## Rendering labels

Every preview carries one label that says how close it is to what the TV actually draws:

| Label | Meaning |
|---|---|
| **Real markup** | The app's own HTML and CSS from the firmware, rendered in an iframe with all scripts removed. This is either a prerendered first frame that ships in `index.en.html` (Settings, Notification Center), a test fixture inside the bundle (Google Assistant), or the DOM from one offline headless-Chromium run (Homebrew Channel). Only the fonts differ from the TV. |
| **Reconstruction from assets** | Hand-built HTML that uses the element's real PNGs, colours and geometry from its QML (`Style.qml`, component sizes). It is used for QML/compositor overlays, which can't run off the TV. Text and layout details are approximations. |
| **Schematic** | A diagram of the parts and data flow, for an element with no UI of its own (AirPlay). |
| **Screenshot (captured YYYY-MM-DD)** | A real frame from the compositor, captured on the live TV (see [Screenshots](#screenshots)). It is shown next to the reconstruction of the same element, so you can compare the two. It appears only when the build is given `--shots`. |

The reconstructions are placed on a 1920×1080 stage that is scaled to the column width. A plain gradient stands in for HDMI video.

## Screenshots

The build never touches the TV. Screenshots are an optional input that you capture yourself and pass with `--shots DIR`.

`DIR/manifest.json`:

```json
{
  "captured": "YYYY-MM-DD",
  "shots": {
    "input-picker": {"file": "input-picker.webp", "alt": "Input picker", "caption": "HTML caption"}
  }
}
```

**Slots.** Valid slot names are listed in `SHOT_SLOTS` in `build.py`: `home`, `hdmi-banner`, `input-picker`, `quick-settings`, `toast`, `volume`, `hotkey`, `live-menu`, `keyboard`. Each slot sits next to the reconstruction of the same element.

**Format.** Images must already be web-ready: WebP, PNG or JPEG, about 300 KB or less. The build copies them to `OUT_DIR/img/shots/` and does not convert them.

**Storage.** Keep the screenshots out of git. `tools/ui-atlas/.local/shots/` is ignored.

### Capturing

The compositor (surface-manager, `YSM/YSM.qml`) registers these as private methods on `com.webos.surfacemanager`. Root `luna-send` on a rooted TV can call them without `-a`.

| Method | Effect |
|---|---|
| `captureCompositorOutput {"output": "/tmp/x.png", "format": "PNG"}` | Writes the composited UI plane as a 1920×1080 image. `format` can be `BMP` (the default), `JPG` or `PNG`. Pass `appId` to capture only that app's surface. |
| `showInputPicker {}` | Opens the input picker (`com.webos.app.quickinputpicker`). |
| `showQuickSettings {}` | Opens Quick Settings (`com.webos.app.quicksettings`). |

`luna-send` prints nothing without a TTY, so use `ssh -tt` and strip the `\r`. Some example captures:

```sh
ssh -tt root@"$TV_HOST" 'luna-send -n 1 luna://com.webos.surfacemanager/showInputPicker "{}"; sleep 2;
  luna-send -n 1 luna://com.webos.surfacemanager/captureCompositorOutput "{\"output\":\"/tmp/ui-cap.png\",\"format\":\"PNG\"}"'
ssh root@"$TV_HOST" 'cat /tmp/ui-cap.png' > input-picker.png
ssh root@"$TV_HOST" 'rm -f /tmp/ui-cap.png'
```

Other overlays:

- **Volume OSD.** Call `luna://com.webos.audio/volumeUp`, then wait about 0.8 s before capturing. Captured earlier, the OSD is still fading in. Read `getVolume` first and `setVolume` it back afterwards.
- **Toast.** `luna://com.webos.notification/createToast {"message": "..."}`. It is not saved to the notification history.
- **Home ribbon and live menu.** Launch them with `luna://com.webos.applicationManager/launch {"id": "com.webos.app.home"}` or `{"id": "com.webos.app.livemenu"}`. The live menu opens on its Guide tab.
- **Closing overlays.** `luna://com.webos.service.networkinput/sendSpecialKey {"key": "BACK"}` closes them. `applicationManager/closeByAppId` fails for the input picker with "no valid life handler".

Things to know about the captures:

- **HDMI video is black.** It is on a separate hardware plane that the compositor doesn't capture.
- **Busybox `sleep` takes whole seconds only.** Use `usleep` for shorter waits.
- **Check every image for personal data before adding it.** Look for:
  - input labels and CEC device names in the input picker;
  - channel lists, which reveal the broadcast market;
  - account names;
  - notification text.

  Blank or pixelate these before converting the image, for example with `magick in.png -resize 1280x720 -quality 85 out.webp`.

These hotkey popups write a TV setting when they open or are opened again, so don't capture them blind:

- Picture Mode (`com.webos.app.tvhotkey`): its legacy hotkey path cycles to the next mode and saves it;
- sleep timer;
- aspect ratio.

The virtual keyboard only appears when a text field has focus.
