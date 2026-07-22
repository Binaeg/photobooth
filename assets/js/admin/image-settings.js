/* globals fabric, photoboothTools */
/* eslint n/no-unsupported-features/node-builtins: "off" */
(function () {
    'use strict';

    const editorRoot = document.getElementById('image_settings_editor');
    if (!editorRoot || typeof fabric === 'undefined') {
        return;
    }

    const maxHistoryEntries = 50;
    const history = [];
    let historyIndex = -1;
    let restoringState = false;
    let placeholderCounter = 1;

    const canvas = new fabric.Canvas('image_settings_canvas', {
        preserveObjectStacking: true,
        selection: true,
        uniformScaling: false
    });

    const modeSelect = document.getElementById('image_settings_mode');
    const widthInput = document.getElementById('image_settings_width');
    const heightInput = document.getElementById('image_settings_height');
    const bgColorInput = document.getElementById('image_settings_background_color');
    const bgImageInput = document.getElementById('image_settings_background_image');
    const bgFitInput = document.getElementById('image_settings_background_fit');
    const modeInput = document.getElementById('editor_mode_input');
    const layoutActionInput = document.getElementById('editor_layout_action');
    const canvasViewport = document.getElementById('image_settings_canvas_viewport');
    const savedLayoutsSelect = document.getElementById('image_settings_saved_layouts');
    const singleLayoutFilesInput = document.getElementById('single_layout_files_json');
    const collageLayoutFilesInput = document.getElementById('collage_layout_files_json');
    const singleLayoutMapInput = document.getElementById('single_layout_map_json');
    const collageLayoutMapInput = document.getElementById('collage_layout_map_json');
    const singleLayoutTargetInput = document.getElementById('editor_layout_file_single');
    const collageLayoutTargetInput = document.getElementById('editor_layout_file_collage');

    const textPropertiesPanel = document.getElementById('text_properties_panel');
    const textContentInput = document.getElementById('is_text_content');
    const textFontSelect = document.getElementById('is_text_font');
    const textSizeInput = document.getElementById('is_text_size');
    const textColorInput = document.getElementById('is_text_color');

    function getAppBasePath() {
        const input = document.getElementById('app_base_path');
        return input && input.value ? input.value : '/';
    }

    function toPublicUrl(rawPath) {
        if (!rawPath) {
            return '';
        }
        if (/^(https?:)?\/\//i.test(rawPath) || rawPath.startsWith('data:') || rawPath.startsWith('/')) {
            return rawPath;
        }

        const base = getAppBasePath();
        const normalizedBase = base.endsWith('/') ? base.slice(0, -1) : base;
        return normalizedBase + '/' + rawPath.replace(/^\//, '');
    }

    function clampNumber(value, min, fallback) {
        const parsed = parseInt(value, 10);
        if (Number.isNaN(parsed) || parsed < min) {
            return fallback;
        }

        return parsed;
    }

    function numberOr(value, fallback) {
        return typeof value === 'number' && !Number.isNaN(value) ? value : fallback;
    }

    const photoAspectRatio = 3 / 2;

    function getPhotoAspectRatio() {
        return photoAspectRatio;
    }

    function getMode() {
        return modeSelect ? modeSelect.value : 'single';
    }

    function parseJsonInput(input, fallback) {
        if (!input || !input.value) {
            return fallback;
        }

        try {
            return JSON.parse(input.value);
        } catch (error) {
            console.log('Unable to parse layout metadata', error);
            return fallback;
        }
    }

    const availableFonts = parseJsonInput(document.getElementById('available_fonts_json'), []);

    function getFontOptions() {
        return Array.isArray(availableFonts) ? availableFonts : [];
    }

    function getDefaultFontOrigin() {
        const options = getFontOptions();
        return options.length ? options[0].origin : '';
    }

    function fontFamilyForOrigin(origin) {
        const found = getFontOptions().find((font) => font.origin === origin);
        return found ? found.name : 'sans-serif';
    }

    const loadedFontFamilies = {};

    function ensureFontLoaded(origin) {
        const family = fontFamilyForOrigin(origin);
        if (family === 'sans-serif' || !window.FontFaceSet || !document.fonts || loadedFontFamilies[family]) {
            return Promise.resolve(family);
        }

        return document.fonts.load('16px "' + family + '"')
            .then(function () {
                loadedFontFamilies[family] = true;
                return family;
            })
            .catch(function () {
                return family;
            });
    }

    function populateFontSelect() {
        if (!textFontSelect) {
            return;
        }

        textFontSelect.innerHTML = '';
        getFontOptions().forEach(function (font) {
            const option = document.createElement('option');
            option.value = font.origin;
            option.textContent = font.name;
            textFontSelect.appendChild(option);
        });
    }

    function getSavedLayoutFiles() {
        if (getMode() === 'single') {
            return parseJsonInput(singleLayoutFilesInput, []);
        }

        return parseJsonInput(collageLayoutFilesInput, []);
    }

    function getSavedLayoutMap() {
        if (getMode() === 'single') {
            return parseJsonInput(singleLayoutMapInput, {});
        }

        return parseJsonInput(collageLayoutMapInput, {});
    }

    function getSelectedLayoutTargetInput() {
        return getMode() === 'single' ? singleLayoutTargetInput : collageLayoutTargetInput;
    }

    function getSelectedLayoutFileName() {
        const targetInput = getSelectedLayoutTargetInput();
        return targetInput ? (targetInput.value || '') : '';
    }

    function setSelectedLayoutFileName(fileName) {
        const targetInput = getSelectedLayoutTargetInput();
        if (targetInput) {
            targetInput.value = fileName || '';
        }
    }

    function refreshSavedLayoutsSelect() {
        if (!savedLayoutsSelect) {
            return;
        }

        const files = getSavedLayoutFiles();
        const selected = getSelectedLayoutFileName();
        savedLayoutsSelect.innerHTML = '';

        if (!files.length) {
            const option = document.createElement('option');
            option.value = '';
            option.textContent = 'No saved layouts';
            savedLayoutsSelect.appendChild(option);
            savedLayoutsSelect.value = '';
            return;
        }

        files.forEach(function (file) {
            const option = document.createElement('option');
            option.value = file;
            option.textContent = file;
            savedLayoutsSelect.appendChild(option);
        });

        const fallback = files[0];
        savedLayoutsSelect.value = files.includes(selected) ? selected : fallback;
        setSelectedLayoutFileName(savedLayoutsSelect.value);
    }

    function getCanvasDimensions() {
        return {
            width: clampNumber(widthInput ? widthInput.value : 1500, 100, 1500),
            height: clampNumber(heightInput ? heightInput.value : 1000, 100, 1000)
        };
    }

    function getBackgroundPayload() {
        return {
            color: bgColorInput ? bgColorInput.value : '#FFFFFF',
            image: bgImageInput ? bgImageInput.value : '',
            fitMode: bgFitInput ? bgFitInput.value : 'cover'
        };
    }

    function setCornerOnlyControls(object) {
        object.setControlsVisibility({
            mt: false,
            mb: false,
            ml: false,
            mr: false,
            mtr: true,
            tl: true,
            tr: true,
            bl: true,
            br: true
        });

        object.set({
            cornerStyle: 'circle',
            transparentCorners: false,
            padding: 0
        });
    }

    function setPictureControls(object) {
        object.setControlsVisibility({
            mt: true,
            mb: true,
            ml: true,
            mr: true,
            mtr: true,
            tl: true,
            tr: true,
            bl: true,
            br: true
        });

        object.set({
            cornerStyle: 'circle',
            transparentCorners: false,
            padding: 0
        });
    }

    function updateCanvasDimensions() {
        const dimensions = getCanvasDimensions();
        canvas.setDimensions({ width: dimensions.width, height: dimensions.height });
        canvas.calcOffset();
        fitCanvasToViewport();
        canvas.requestRenderAll();
    }

    function fitCanvasToViewport() {
        if (!canvasViewport) {
            return;
        }

        const viewportWidth = Math.max(100, canvasViewport.clientWidth - 16);
        const viewportHeight = Math.max(100, canvasViewport.clientHeight - 16);
        const logicalWidth = canvas.getWidth();
        const logicalHeight = canvas.getHeight();
        const scale = Math.min(viewportWidth / logicalWidth, viewportHeight / logicalHeight);

        canvas.setDimensions(
            {
                width: Math.floor(logicalWidth * scale),
                height: Math.floor(logicalHeight * scale)
            },
            { cssOnly: true }
        );
        canvas.calcOffset();
    }

    function applyBackground() {
        const background = getBackgroundPayload();
        canvas.backgroundColor = background.color;
        canvas.requestRenderAll();

        if (!background.image) {
            canvas.backgroundImage = undefined;
            canvas.requestRenderAll();
            return;
        }

        fabric.Image.fromURL(toPublicUrl(background.image), { crossOrigin: 'anonymous' })
            .then(function (img) {
                const canvasWidth = canvas.getWidth();
                const canvasHeight = canvas.getHeight();
                const imgWidth = img.width || canvasWidth;
                const imgHeight = img.height || canvasHeight;
                const scaleX = canvasWidth / imgWidth;
                const scaleY = canvasHeight / imgHeight;

                if (background.fitMode === 'contain') {
                    const scale = Math.min(scaleX, scaleY);
                    img.set({
                        originX: 'left',
                        originY: 'top',
                        left: (canvasWidth - imgWidth * scale) / 2,
                        top: (canvasHeight - imgHeight * scale) / 2,
                        scaleX: scale,
                        scaleY: scale
                    });
                } else if (background.fitMode === 'stretch') {
                    img.set({
                        originX: 'left',
                        originY: 'top',
                        left: 0,
                        top: 0,
                        scaleX,
                        scaleY
                    });
                } else {
                    const scale = Math.max(scaleX, scaleY);
                    img.set({
                        originX: 'left',
                        originY: 'top',
                        left: (canvasWidth - imgWidth * scale) / 2,
                        top: (canvasHeight - imgHeight * scale) / 2,
                        scaleX: scale,
                        scaleY: scale
                    });
                }

                canvas.backgroundImage = img;
                canvas.requestRenderAll();
            })
            .catch(function (error) {
                console.log('Unable to load background image', error);
            });
    }

    function buildPlaceholderLabel(index) {
        return new fabric.Text('Photo ' + index, {
            fontSize: 24,
            fill: '#1f2937',
            originX: 'center',
            originY: 'center',
            selectable: false,
            evented: false
        });
    }

    function getDefaultPlaceholderSize() {
        const dimensions = getCanvasDimensions();
        const ratio = getPhotoAspectRatio();
        if (!ratio) {
            return { width: dimensions.width, height: dimensions.height };
        }

        let width = dimensions.width;
        let height = width / ratio;
        if (height > dimensions.height) {
            height = dimensions.height;
            width = height * ratio;
        }

        return {
            width: Math.round(width),
            height: Math.round(height)
        };
    }

    function createPlaceholderObject(left, top, width, height, angle, index) {
        const defaultSize = getDefaultPlaceholderSize();
        const safeWidth = Math.max(120, numberOr(width, defaultSize.width));
        const safeHeight = Math.max(120, numberOr(height, defaultSize.height));
        const safeIndex = index || placeholderCounter;

        const box = new fabric.Rect({
            width: safeWidth,
            height: safeHeight,
            fill: '#dbeafe',
            stroke: '#2563eb',
            strokeDashArray: [10, 8],
            strokeWidth: 3,
            originX: 'center',
            originY: 'center'
        });

        const label = buildPlaceholderLabel(safeIndex);

        const group = new fabric.Group([box, label], {
            objectType: 'placeholder',
            placeholderIndex: safeIndex,
            lockAspectRatio: true,
            layoutManager: new fabric.LayoutManager(new fabric.FixedLayout()),
            width: safeWidth,
            height: safeHeight,
            originX: 'left',
            originY: 'top',
            left: numberOr(left, 80),
            top: numberOr(top, 80),
            angle: numberOr(angle, 0),
            borderColor: '#2563eb',
            cornerColor: '#1d4ed8'
        });

        setCornerOnlyControls(group);
        return group;
    }

    const textBoxPadding = 6;

    function getGroupTextbox(group) {
        return group._objects.find((child) => child instanceof fabric.Textbox);
    }

    function getGroupFrame(group) {
        return group._objects.find((child) => child instanceof fabric.Rect);
    }

    // Keeps the frame, the inner textbox and the clip path in sync with the group's
    // width/height/verticalAlign. Text is never scaled/stretched: the box just gets
    // wider (text reflows) or taller (text stays the same size, but is repositioned
    // top/middle/bottom within the available space).
    function layoutTextGroup(group) {
        const textbox = getGroupTextbox(group);
        const frame = getGroupFrame(group);
        if (!textbox || !frame) {
            return;
        }

        const width = Math.max(40, group.width || 40);
        const height = Math.max(20, group.height || 20);

        // Children live in the group's local, center-origin coordinate space, so the
        // box's own top-left corner sits at (-width/2, -height/2) there. Every resize
        // has to re-anchor both children to that corner, otherwise they drift away
        // from the group's own (symmetric) selection border as width/height change.
        const localLeft = -width / 2;
        const localTop = -height / 2;

        frame.set({ left: localLeft, top: localTop, width, height });
        textbox.set({ width: Math.max(10, width - textBoxPadding * 2) });

        const contentHeight = textbox.height || 0;
        let textTop = localTop + textBoxPadding;
        if (group.verticalAlign === 'middle') {
            textTop = localTop + (height - contentHeight) / 2;
        } else if (group.verticalAlign === 'bottom') {
            textTop = localTop + height - contentHeight - textBoxPadding;
        }

        textbox.set({ left: localLeft + textBoxPadding, top: textTop });

        // No clipPath here on purpose: the PHP/GD renderer never clips overflowing text
        // either, so leaving it unclipped keeps the preview honest about what will print.
        group.set({ width, height });
        group.setCoords();
    }

    function createTextResizeControls() {
        const cu = fabric.controlsUtils;

        const changeWidthAndHeight = cu.wrapWithFireEvent(
            'resizing',
            cu.wrapWithFixedAnchor(function (eventData, transform, x, y) {
                const changedWidth = cu.changeObjectWidth(eventData, transform, x, y);
                const changedHeight = cu.changeObjectHeight(eventData, transform, x, y);
                return changedWidth || changedHeight;
            })
        );

        return {
            ml: new fabric.Control({ x: -0.5, y: 0, cursorStyleHandler: cu.scaleSkewCursorStyleHandler, actionHandler: cu.changeWidth, actionName: 'resizing' }),
            mr: new fabric.Control({ x: 0.5, y: 0, cursorStyleHandler: cu.scaleSkewCursorStyleHandler, actionHandler: cu.changeWidth, actionName: 'resizing' }),
            mt: new fabric.Control({ x: 0, y: -0.5, cursorStyleHandler: cu.scaleSkewCursorStyleHandler, actionHandler: cu.changeHeight, actionName: 'resizing' }),
            mb: new fabric.Control({ x: 0, y: 0.5, cursorStyleHandler: cu.scaleSkewCursorStyleHandler, actionHandler: cu.changeHeight, actionName: 'resizing' }),
            tl: new fabric.Control({ x: -0.5, y: -0.5, cursorStyleHandler: cu.scaleCursorStyleHandler, actionHandler: changeWidthAndHeight, actionName: 'resizing' }),
            tr: new fabric.Control({ x: 0.5, y: -0.5, cursorStyleHandler: cu.scaleCursorStyleHandler, actionHandler: changeWidthAndHeight, actionName: 'resizing' }),
            bl: new fabric.Control({ x: -0.5, y: 0.5, cursorStyleHandler: cu.scaleCursorStyleHandler, actionHandler: changeWidthAndHeight, actionName: 'resizing' }),
            br: new fabric.Control({ x: 0.5, y: 0.5, cursorStyleHandler: cu.scaleCursorStyleHandler, actionHandler: changeWidthAndHeight, actionName: 'resizing' }),
            mtr: new fabric.Control({
                x: 0,
                y: -0.5,
                actionHandler: cu.rotationWithSnapping,
                cursorStyleHandler: cu.rotationStyleHandler,
                offsetY: -40,
                withConnection: true,
                actionName: 'rotate'
            })
        };
    }

    function setTextControls(group) {
        group.set({
            lockScalingFlip: true,
            borderColor: '#7c3aed',
            cornerColor: '#6d28d9'
        });
        group.controls = createTextResizeControls();
        group.setControlsVisibility({ mt: true, mb: true, ml: true, mr: true, mtr: true, tl: true, tr: true, bl: true, br: true });
    }

    function handleTextResizing(e) {
        const target = e.target;
        if (!target || target.objectType !== 'text') {
            return;
        }

        layoutTextGroup(target);
        canvas.requestRenderAll();
    }

    function createTextObject(textValue, left, top, angle, fontSize, color, fontPath, width, boxHeight, textAlign, verticalAlign) {
        const safeFontSize = numberOr(fontSize, 56);
        const safeWidth = Math.max(40, numberOr(width, 360));
        const safeHeight = Math.max(20, numberOr(boxHeight, Math.round(safeFontSize * 1.8)));
        const safeFontPath = fontPath || getDefaultFontOrigin();

        const frame = new fabric.Rect({
            width: safeWidth,
            height: safeHeight,
            fill: 'transparent',
            stroke: '#7c3aed',
            strokeDashArray: [8, 6],
            strokeWidth: 2,
            originX: 'left',
            originY: 'top',
            selectable: false,
            evented: false
        });

        const textbox = new fabric.Textbox(textValue || 'Your text', {
            originX: 'left',
            originY: 'top',
            width: Math.max(10, safeWidth - textBoxPadding * 2),
            fontSize: safeFontSize,
            fill: color || '#111111',
            fontFamily: fontFamilyForOrigin(safeFontPath),
            textAlign: textAlign || 'left',
            selectable: false,
            evented: false
        });

        const group = new fabric.Group([frame, textbox], {
            objectType: 'text',
            fontPath: safeFontPath,
            verticalAlign: verticalAlign || 'top',
            layoutManager: new fabric.LayoutManager(new fabric.FixedLayout()),
            width: safeWidth,
            height: safeHeight,
            originX: 'left',
            originY: 'top',
            left: numberOr(left, 100),
            top: numberOr(top, 100),
            angle: numberOr(angle, 0)
        });

        layoutTextGroup(group);
        setTextControls(group);
        ensureFontLoaded(safeFontPath).then(function () {
            canvas.requestRenderAll();
        });

        return group;
    }

    function getActiveTextGroup() {
        const active = canvas.getActiveObject();
        return active && active.objectType === 'text' ? active : null;
    }

    function updateAlignButtonsState(textAlign, verticalAlign) {
        [['is_text_align_left', 'left'], ['is_text_align_center', 'center'], ['is_text_align_right', 'right']].forEach(function (pair) {
            const button = document.getElementById(pair[0]);
            if (!button) {
                return;
            }
            button.classList.toggle('bg-violet-600', textAlign === pair[1]);
            button.classList.toggle('text-white', textAlign === pair[1]);
        });

        [['is_text_valign_top', 'top'], ['is_text_valign_middle', 'middle'], ['is_text_valign_bottom', 'bottom']].forEach(function (pair) {
            const button = document.getElementById(pair[0]);
            if (!button) {
                return;
            }
            button.classList.toggle('bg-violet-600', verticalAlign === pair[1]);
            button.classList.toggle('text-white', verticalAlign === pair[1]);
        });
    }

    function updateTextPanel() {
        const group = getActiveTextGroup();
        if (!textPropertiesPanel) {
            return;
        }

        if (!group) {
            textPropertiesPanel.classList.add('hidden');
            return;
        }

        const textbox = getGroupTextbox(group);
        textPropertiesPanel.classList.remove('hidden');

        if (textContentInput) {
            textContentInput.value = textbox.text || '';
        }
        if (textFontSelect) {
            textFontSelect.value = group.fontPath || getDefaultFontOrigin();
        }
        if (textSizeInput) {
            textSizeInput.value = Math.round(textbox.fontSize);
        }
        if (textColorInput) {
            textColorInput.value = textbox.fill || '#111111';
        }
        updateAlignButtonsState(textbox.textAlign || 'left', group.verticalAlign || 'top');
    }

    function createPictureObject(path, left, top, width, height, angle, callback) {
        fabric.Image.fromURL(toPublicUrl(path), { crossOrigin: 'anonymous' })
            .then(function (img) {
                img.set({
                    objectType: 'picture',
                    sourcePath: path,
                    originX: 'left',
                    originY: 'top',
                    left: numberOr(left, 100),
                    top: numberOr(top, 100),
                    angle: numberOr(angle, 0),
                    borderColor: '#059669',
                    cornerColor: '#047857'
                });

                const nativeWidth = img.width || 300;
                const nativeHeight = img.height || 220;
                const targetWidth = Math.max(20, numberOr(width, nativeWidth));
                const targetHeight = Math.max(20, numberOr(height, nativeHeight));
                img.set({
                    scaleX: targetWidth / nativeWidth,
                    scaleY: targetHeight / nativeHeight
                });

                setPictureControls(img);
                callback(img);
            })
            .catch(function (error) {
                console.log('Unable to load picture', error);
            });
    }

    function getPlaceholderCount() {
        return canvas.getObjects().filter((obj) => obj.objectType === 'placeholder').length;
    }

    function addPlaceholder() {
        if (getMode() === 'single' && getPlaceholderCount() >= 1) {
            alert('Single-shot mode supports only one placeholder.');
            return;
        }

        const dimensions = getCanvasDimensions();
        const defaultSize = getDefaultPlaceholderSize();
        const left = (dimensions.width - defaultSize.width) / 2;
        const top = (dimensions.height - defaultSize.height) / 2;
        const obj = createPlaceholderObject(left, top, defaultSize.width, defaultSize.height, 0, placeholderCounter);
        placeholderCounter += 1;
        canvas.add(obj);
        canvas.setActiveObject(obj);
        canvas.requestRenderAll();
    }

    function addText() {
        const obj = createTextObject('Your text', 120 + historyIndex * 2, 120 + historyIndex * 2, 0, 56, '#111111', '');
        canvas.add(obj);
        canvas.setActiveObject(obj);
        canvas.requestRenderAll();
    }

    function insertPicture(source) {
        if (!source) {
            return;
        }

        createPictureObject(source, 140, 140, undefined, undefined, 0, function (img) {
            canvas.add(img);
            canvas.setActiveObject(img);
            canvas.requestRenderAll();
        });
    }

    const picturePickerModal = document.getElementById('picture_picker_modal');
    const picturePickerGrid = document.getElementById('picture_picker_grid');
    const picturePickerEmpty = document.getElementById('picture_picker_empty');
    const picturePickerUploadInput = document.getElementById('picture_picker_upload_input');
    const picturePickerUploadStatus = document.getElementById('picture_picker_upload_status');
    const picturePickerClose = document.getElementById('picture_picker_close');

    function closePicturePicker() {
        if (picturePickerModal) {
            picturePickerModal.classList.add('hidden');
        }
    }

    function renderPictureGrid(images) {
        if (!picturePickerGrid) {
            return;
        }

        picturePickerGrid.innerHTML = '';
        const hasImages = Array.isArray(images) && images.length > 0;
        if (picturePickerEmpty) {
            picturePickerEmpty.classList.toggle('hidden', hasImages);
        }

        if (!hasImages) {
            return;
        }

        images.forEach(function (image) {
            const button = document.createElement('button');
            button.type = 'button';
            button.title = image.name;
            button.className = 'group relative aspect-square rounded border border-slate-300 overflow-hidden bg-slate-100 hover:border-brand-1 focus:outline-none focus:ring-2 focus:ring-brand-1';

            const img = document.createElement('img');
            img.src = image.url;
            img.alt = image.name;
            img.className = 'w-full h-full object-cover';
            button.appendChild(img);

            button.addEventListener('click', function () {
                insertPicture(image.url);
                closePicturePicker();
            });

            picturePickerGrid.appendChild(button);
        });
    }

    function loadPictureList() {
        return fetch('pictures.php', { credentials: 'same-origin' })
            .then(function (response) {
                return response.json();
            })
            .then(function (data) {
                renderPictureGrid(data && data.success ? data.images : []);
            })
            .catch(function (error) {
                console.log('Unable to load pictures', error);
                renderPictureGrid([]);
            });
    }

    function openPicturePicker() {
        if (!picturePickerModal) {
            return;
        }

        picturePickerModal.classList.remove('hidden');
        if (picturePickerUploadStatus) {
            picturePickerUploadStatus.textContent = '';
        }
        loadPictureList();
    }

    function uploadPicture(file) {
        if (!file) {
            return;
        }

        const formData = new FormData();
        formData.append('files[]', file);

        if (picturePickerUploadStatus) {
            picturePickerUploadStatus.textContent = 'Uploading…';
        }

        fetch('pictures.php', { method: 'POST', body: formData, credentials: 'same-origin' })
            .then(function (response) {
                return response.json();
            })
            .then(function (data) {
                if (picturePickerUploadStatus) {
                    picturePickerUploadStatus.textContent = data && data.success ? 'Upload successful' : (data && data.message) || 'Upload failed';
                }
                return loadPictureList();
            })
            .catch(function (error) {
                console.log('Unable to upload picture', error);
                if (picturePickerUploadStatus) {
                    picturePickerUploadStatus.textContent = 'Upload failed';
                }
            });
    }

    function addPicture() {
        openPicturePicker();
    }

    function removeSelectedObject() {
        const activeObject = canvas.getActiveObject();
        if (!activeObject) {
            return;
        }

        canvas.remove(activeObject);
        canvas.discardActiveObject();
        canvas.requestRenderAll();
    }

    function saveHistory() {
        if (restoringState) {
            return;
        }

        const snapshot = JSON.stringify(canvas.toObject(['objectType', 'placeholderIndex', 'fontPath', 'verticalAlign', 'sourcePath', 'lockAspectRatio']));
        if (history[historyIndex] === snapshot) {
            return;
        }

        if (historyIndex < history.length - 1) {
            history.splice(historyIndex + 1);
        }

        history.push(snapshot);
        if (history.length > maxHistoryEntries) {
            history.shift();
        }

        historyIndex = history.length - 1;
        updateHistoryButtons();
    }

    function restoreHistoryAt(index) {
        if (index < 0 || index >= history.length) {
            return;
        }

        restoringState = true;
        canvas.loadFromJSON(history[index]).then(function () {
            canvas.getObjects().forEach(function (obj) {
                if (obj.objectType === 'text') {
                    setTextControls(obj);
                    layoutTextGroup(obj);
                } else if (obj.objectType === 'picture') {
                    setPictureControls(obj);
                } else {
                    setCornerOnlyControls(obj);
                }
            });
            canvas.requestRenderAll();
            restoringState = false;
            historyIndex = index;
            updateHistoryButtons();
            recomputePlaceholderCounter();
            updateTextPanel();
        });
    }

    function undo() {
        if (historyIndex <= 0) {
            return;
        }

        restoreHistoryAt(historyIndex - 1);
    }

    function redo() {
        if (historyIndex >= history.length - 1) {
            return;
        }

        restoreHistoryAt(historyIndex + 1);
    }

    function recomputePlaceholderCounter() {
        const maxPlaceholder = canvas
            .getObjects()
            .filter((obj) => obj.objectType === 'placeholder')
            .reduce((max, obj) => Math.max(max, obj.placeholderIndex || 0), 0);

        placeholderCounter = maxPlaceholder + 1;
    }

    function objectToDocumentItem(obj, zIndex) {
        const width = Math.round((obj.width || 0) * (obj.scaleX || 1));
        const height = Math.round((obj.height || 0) * (obj.scaleY || 1));

        if (obj.objectType === 'placeholder') {
            return {
                type: 'placeholder',
                x: Math.round(obj.left || 0),
                y: Math.round(obj.top || 0),
                width,
                height,
                rotation: Math.round(obj.angle || 0),
                zIndex,
                placeholderIndex: obj.placeholderIndex || zIndex + 1,
                frameEnabled: false
            };
        }

        if (obj.objectType === 'text') {
            const textbox = getGroupTextbox(obj);
            return {
                type: 'text',
                x: Math.round(obj.left || 0),
                y: Math.round(obj.top || 0),
                width,
                height,
                rotation: Math.round(obj.angle || 0),
                zIndex,
                text: (textbox && textbox.text) || '',
                fontPath: obj.fontPath || '',
                fontSize: Math.round((textbox && textbox.fontSize) || 56),
                color: (textbox && textbox.fill) || '#111111',
                textAlign: (textbox && textbox.textAlign) || 'left',
                verticalAlign: obj.verticalAlign || 'top'
            };
        }

        if (obj.objectType === 'picture') {
            return {
                type: 'picture',
                x: Math.round(obj.left || 0),
                y: Math.round(obj.top || 0),
                width,
                height,
                rotation: Math.round(obj.angle || 0),
                zIndex,
                path: obj.sourcePath || ''
            };
        }

        return null;
    }

    function buildEditorDocument() {
        const dimensions = getCanvasDimensions();
        const background = getBackgroundPayload();

        const objects = canvas
            .getObjects()
            .map((obj, index) => objectToDocumentItem(obj, index))
            .filter((entry) => entry !== null);

        return {
            schemaVersion: 3,
            mode: getMode(),
            width: dimensions.width,
            height: dimensions.height,
            background: {
                color: background.color,
                image: background.image,
                fitMode: background.fitMode
            },
            objects
        };
    }

    function loadDocument(documentData, preserveMode) {
        if (!documentData || !Number(documentData.schemaVersion)) {
            return false;
        }

        const mode = documentData.mode || 'collage';
        if (!preserveMode && modeSelect) {
            modeSelect.value = mode;
        }
        if (!preserveMode && modeInput) {
            modeInput.value = mode;
        }

        if (widthInput && documentData.width) {
            widthInput.value = documentData.width;
        }
        if (heightInput && documentData.height) {
            heightInput.value = documentData.height;
        }

        if (bgColorInput && documentData.background && documentData.background.color) {
            bgColorInput.value = documentData.background.color;
        }
        if (bgImageInput && documentData.background && documentData.background.image) {
            bgImageInput.value = documentData.background.image;
        }
        if (bgFitInput && documentData.background && documentData.background.fitMode) {
            bgFitInput.value = documentData.background.fitMode;
        }

        updateCanvasDimensions();
        canvas.clear();
        applyBackground();

        const objects = Array.isArray(documentData.objects) ? documentData.objects : [];
        const ordered = objects.sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0));

        const loadPromises = ordered.map((item) => new Promise((resolve) => {
            if (item.type === 'placeholder') {
                const placeholder = createPlaceholderObject(item.x, item.y, item.width, item.height, item.rotation, item.placeholderIndex);
                canvas.add(placeholder);
                resolve();
                return;
            }

            if (item.type === 'text') {
                const text = createTextObject(item.text, item.x, item.y, item.rotation, item.fontSize, item.color, item.fontPath, item.width, item.height, item.textAlign, item.verticalAlign);
                canvas.add(text);
                resolve();
                return;
            }

            if (item.type === 'picture' && item.path) {
                createPictureObject(item.path, item.x, item.y, item.width, item.height, item.rotation, function (img) {
                    canvas.add(img);
                    resolve();
                });
                return;
            }

            resolve();
        }));

        Promise.all(loadPromises).then(function () {
            recomputePlaceholderCounter();
            canvas.requestRenderAll();
            saveHistory();
        });

        return true;
    }

    function updateHistoryButtons() {
        const undoButton = document.getElementById('is_undo');
        const redoButton = document.getElementById('is_redo');
        if (undoButton) {
            undoButton.disabled = historyIndex <= 0;
        }
        if (redoButton) {
            redoButton.disabled = historyIndex >= history.length - 1;
        }
    }

    function saveImageSettings() {
        const canSubmit = document.getElementById('can_submit');
        const payload = JSON.stringify(buildEditorDocument(), null, 2);

        if (!modeInput) {
            return;
        }
        modeInput.value = getMode();
        if (layoutActionInput) {
            layoutActionInput.value = 'save';
        }
        if (savedLayoutsSelect) {
            setSelectedLayoutFileName(savedLayoutsSelect.value);
        }

        if (canSubmit && canSubmit.value === '1') {
            const payloadInput = document.getElementById('editor_payload_input');
            if (payloadInput) {
                payloadInput.value = payload;
            }

            const form = document.getElementById('image_settings_form');
            if (form) {
                form.submit();
            }
            return;
        }

        if (typeof photoboothTools !== 'undefined' && photoboothTools.modal) {
            photoboothTools.modal.open();
            const modalBody = photoboothTools.modal.element.querySelector('.modal-body');
            const enableWriteMessage = document.getElementById('enable_write_message');

            const messageDiv = document.createElement('div');
            messageDiv.innerText = enableWriteMessage ? enableWriteMessage.value : 'Configuration file is not writeable.';
            modalBody.appendChild(messageDiv);

            const jsonDiv = document.createElement('div');
            jsonDiv.innerText = payload;
            jsonDiv.style.fontFamily = 'monospace';
            modalBody.appendChild(jsonDiv);
        }
    }

    function saveImageSettingsAs() {
        const mode = getMode();
        const rawName = prompt('Layout file name', mode + '-layout-' + Date.now());
        if (!rawName) {
            return;
        }

        let cleaned = rawName.trim().replace(/[^A-Za-z0-9._-]/g, '');
        if (!cleaned) {
            alert('Invalid file name.');
            return;
        }

        if (!cleaned.toLowerCase().endsWith('.json')) {
            cleaned += '.json';
        }

        setSelectedLayoutFileName(cleaned);
        if (savedLayoutsSelect) {
            const existing = Array.from(savedLayoutsSelect.options).map((opt) => opt.value);
            if (!existing.includes(cleaned)) {
                const option = document.createElement('option');
                option.value = cleaned;
                option.textContent = cleaned;
                savedLayoutsSelect.appendChild(option);
            }
            savedLayoutsSelect.value = cleaned;
        }

        saveImageSettings();
    }

    function deleteSelectedLayout() {
        if (!savedLayoutsSelect || !savedLayoutsSelect.value) {
            return;
        }

        const really = confirm('Delete selected layout?');
        if (!really) {
            return;
        }

        setSelectedLayoutFileName(savedLayoutsSelect.value);
        if (layoutActionInput) {
            layoutActionInput.value = 'delete';
        }

        const payloadInput = document.getElementById('editor_payload_input');
        if (payloadInput) {
            payloadInput.value = '{}';
        }
        const form = document.getElementById('image_settings_form');
        if (form) {
            form.submit();
        }
    }

    function openSelectedLayout() {
        if (!savedLayoutsSelect) {
            console.warn('[image-settings] openSelectedLayout: no savedLayoutsSelect element found');
            return;
        }

        const fileName = savedLayoutsSelect.value;
        setSelectedLayoutFileName(fileName);
        const layoutMap = getSavedLayoutMap();
        const selectedLayout = layoutMap[fileName];
        if (!selectedLayout) {
            console.warn('[image-settings] openSelectedLayout: no saved layout found for "' + fileName + '" in map', layoutMap);
            return;
        }

        if (!loadDocument(selectedLayout, true)) {
            console.warn('[image-settings] openSelectedLayout: loadDocument rejected the document for "' + fileName + '"', selectedLayout);
        }
    }

    function onModeChange() {
        if (modeInput) {
            modeInput.value = getMode();
        }

        refreshSavedLayoutsSelect();

        canvas.clear();
        updateCanvasDimensions();
        applyBackground();

        const singleConfigInput = document.getElementById('single_config_json');
        const collageConfigInput = document.getElementById('collage_config_json');
        const source = getMode() === 'single' ? singleConfigInput : collageConfigInput;

        const layoutFileName = getSelectedLayoutFileName();
        const layoutMap = getSavedLayoutMap();
        if (layoutFileName && layoutMap[layoutFileName]) {
            if (loadDocument(layoutMap[layoutFileName], true)) {
                return;
            }
        }

        if (source && source.value) {
            try {
                const parsed = JSON.parse(source.value);
                if (loadDocument(parsed, true)) {
                    return;
                }
            } catch (error) {
                console.log('Unable to parse mode config', error);
            }
        }

        if (getMode() === 'single') {
            addPlaceholder();
        } else {
            addPlaceholder();
            addPlaceholder();
        }
        saveHistory();
    }

    const snapThreshold = 10;

    function handleObjectMoving(e) {
        const target = e.target;
        if (!target) {
            return;
        }

        target.setCoords();
        const bounds = target.getBoundingRect();
        const canvasWidth = canvas.getWidth();
        const canvasHeight = canvas.getHeight();

        let dx = 0;
        let dy = 0;

        const leftDelta = 0 - bounds.left;
        const rightDelta = canvasWidth - (bounds.left + bounds.width);
        const hCenterDelta = (canvasWidth / 2) - (bounds.left + bounds.width / 2);

        if (Math.abs(leftDelta) < snapThreshold) {
            dx = leftDelta;
        } else if (Math.abs(rightDelta) < snapThreshold) {
            dx = rightDelta;
        } else if (Math.abs(hCenterDelta) < snapThreshold) {
            dx = hCenterDelta;
        }

        const topDelta = 0 - bounds.top;
        const bottomDelta = canvasHeight - (bounds.top + bounds.height);
        const vCenterDelta = (canvasHeight / 2) - (bounds.top + bounds.height / 2);

        if (Math.abs(topDelta) < snapThreshold) {
            dy = topDelta;
        } else if (Math.abs(bottomDelta) < snapThreshold) {
            dy = bottomDelta;
        } else if (Math.abs(vCenterDelta) < snapThreshold) {
            dy = vCenterDelta;
        }

        if (dx !== 0 || dy !== 0) {
            target.set({ left: target.left + dx, top: target.top + dy });
            target.setCoords();
        }
    }

    function handleObjectScaling(e) {
        const target = e.target;
        if (!target) {
            return;
        }

        if (target.lockAspectRatio) {
            target.set('scaleY', target.scaleX);
        }

        const transform = e.transform;
        if (!transform || !transform.corner || Math.abs(target.angle || 0) > 0.5) {
            target.setCoords();
            return;
        }

        const corner = transform.corner;
        const isRight = corner === 'tr' || corner === 'br' || corner === 'mr';
        const isLeft = corner === 'tl' || corner === 'bl' || corner === 'ml';
        const isBottom = corner === 'bl' || corner === 'br' || corner === 'mb';
        const isTop = corner === 'tl' || corner === 'tr' || corner === 'mt';

        const canvasWidth = canvas.getWidth();
        const canvasHeight = canvas.getHeight();

        target.setCoords();
        let bounds = target.getBoundingRect();

        // Snap the fixed (non-dragged) anchor corner into exact alignment first.
        // Otherwise, if the anchor sits even a few px off a canvas edge, filling
        // to the dragged corner while locked to an aspect ratio will hit one axis
        // exactly and leave a proportional gap on the other.
        let anchorDX = 0;
        let anchorDY = 0;
        if (isRight && Math.abs(bounds.left) < snapThreshold) {
            anchorDX = -bounds.left;
        } else if (isLeft && Math.abs((bounds.left + bounds.width) - canvasWidth) < snapThreshold) {
            anchorDX = canvasWidth - (bounds.left + bounds.width);
        }
        if (isBottom && Math.abs(bounds.top) < snapThreshold) {
            anchorDY = -bounds.top;
        } else if (isTop && Math.abs((bounds.top + bounds.height) - canvasHeight) < snapThreshold) {
            anchorDY = canvasHeight - (bounds.top + bounds.height);
        }

        if (anchorDX !== 0 || anchorDY !== 0) {
            target.set({ left: target.left + anchorDX, top: target.top + anchorDY });
            target.setCoords();
            bounds = target.getBoundingRect();
        }

        let horizontal = null;
        if (isRight && bounds.width > 0) {
            const distance = Math.abs((bounds.left + bounds.width) - canvasWidth);
            if (distance < snapThreshold) {
                horizontal = { factor: (canvasWidth - bounds.left) / bounds.width, distance, anchorLeft: null };
            }
        } else if (isLeft && bounds.width > 0) {
            const distance = Math.abs(bounds.left);
            if (distance < snapThreshold) {
                horizontal = { factor: (bounds.left + bounds.width) / bounds.width, distance, anchorLeft: 0 };
            }
        }

        let vertical = null;
        if (isBottom && bounds.height > 0) {
            const distance = Math.abs((bounds.top + bounds.height) - canvasHeight);
            if (distance < snapThreshold) {
                vertical = { factor: (canvasHeight - bounds.top) / bounds.height, distance, anchorTop: null };
            }
        } else if (isTop && bounds.height > 0) {
            const distance = Math.abs(bounds.top);
            if (distance < snapThreshold) {
                vertical = { factor: (bounds.top + bounds.height) / bounds.height, distance, anchorTop: 0 };
            }
        }

        if (target.lockAspectRatio) {
            // Only one uniform factor can be applied at a time, otherwise the
            // second axis silently overrides the first and the object jumps.
            // Prefer whichever edge is actually closer to its snap line.
            const chosen = horizontal && (!vertical || horizontal.distance <= vertical.distance) ? horizontal : vertical;
            if (chosen) {
                const newScale = target.scaleX * chosen.factor;
                target.set({ scaleX: newScale, scaleY: newScale });
                if (chosen.anchorLeft !== undefined && chosen.anchorLeft !== null) {
                    target.set('left', chosen.anchorLeft);
                }
                if (chosen.anchorTop !== undefined && chosen.anchorTop !== null) {
                    target.set('top', chosen.anchorTop);
                }
            }
        } else {
            if (horizontal) {
                target.set('scaleX', target.scaleX * horizontal.factor);
                if (horizontal.anchorLeft !== null) {
                    target.set('left', horizontal.anchorLeft);
                }
            }
            if (vertical) {
                target.set('scaleY', target.scaleY * vertical.factor);
                if (vertical.anchorTop !== null) {
                    target.set('top', vertical.anchorTop);
                }
            }
        }

        target.setCoords();
    }

    function bindEvents() {
        canvas.on('object:added', saveHistory);
        canvas.on('object:modified', saveHistory);
        canvas.on('object:moving', handleObjectMoving);
        canvas.on('object:scaling', handleObjectScaling);
        canvas.on('object:resizing', handleTextResizing);
        canvas.on('object:removed', saveHistory);
        canvas.on('selection:created', updateTextPanel);
        canvas.on('selection:updated', updateTextPanel);
        canvas.on('selection:cleared', updateTextPanel);

        const addPlaceholderButton = document.getElementById('is_add_placeholder');
        if (addPlaceholderButton) {
            addPlaceholderButton.addEventListener('click', addPlaceholder);
        }

        const addTextButton = document.getElementById('is_add_text');
        if (addTextButton) {
            addTextButton.addEventListener('click', addText);
        }

        const addPictureButton = document.getElementById('is_add_picture');
        if (addPictureButton) {
            addPictureButton.addEventListener('click', addPicture);
        }

        if (picturePickerClose) {
            picturePickerClose.addEventListener('click', closePicturePicker);
        }

        if (picturePickerModal) {
            picturePickerModal.addEventListener('click', function (event) {
                if (event.target === picturePickerModal) {
                    closePicturePicker();
                }
            });
        }

        if (picturePickerUploadInput) {
            picturePickerUploadInput.addEventListener('change', function () {
                const file = picturePickerUploadInput.files && picturePickerUploadInput.files[0];
                uploadPicture(file);
                picturePickerUploadInput.value = '';
            });
        }

        const undoButton = document.getElementById('is_undo');
        if (undoButton) {
            undoButton.addEventListener('click', undo);
        }

        const redoButton = document.getElementById('is_redo');
        if (redoButton) {
            redoButton.addEventListener('click', redo);
        }

        if (textContentInput) {
            textContentInput.addEventListener('input', function () {
                const group = getActiveTextGroup();
                if (!group) {
                    return;
                }
                getGroupTextbox(group).set('text', textContentInput.value);
                layoutTextGroup(group);
                canvas.requestRenderAll();
            });
            textContentInput.addEventListener('change', saveHistory);
        }

        if (textFontSelect) {
            textFontSelect.addEventListener('change', function () {
                const group = getActiveTextGroup();
                if (!group) {
                    return;
                }
                const textbox = getGroupTextbox(group);
                group.set('fontPath', textFontSelect.value);
                textbox.set('fontFamily', fontFamilyForOrigin(textFontSelect.value));
                ensureFontLoaded(textFontSelect.value).then(function () {
                    canvas.requestRenderAll();
                });
                canvas.requestRenderAll();
                saveHistory();
            });
        }

        if (textSizeInput) {
            textSizeInput.addEventListener('change', function () {
                const group = getActiveTextGroup();
                if (!group) {
                    return;
                }
                const textbox = getGroupTextbox(group);
                textbox.set('fontSize', clampNumber(textSizeInput.value, 1, textbox.fontSize));
                layoutTextGroup(group);
                canvas.requestRenderAll();
                saveHistory();
            });
        }

        if (textColorInput) {
            textColorInput.addEventListener('input', function () {
                const group = getActiveTextGroup();
                if (!group) {
                    return;
                }
                getGroupTextbox(group).set('fill', textColorInput.value);
                canvas.requestRenderAll();
            });
            textColorInput.addEventListener('change', saveHistory);
        }

        ['left', 'center', 'right'].forEach(function (align) {
            const button = document.getElementById('is_text_align_' + align);
            if (!button) {
                return;
            }
            button.addEventListener('click', function () {
                const group = getActiveTextGroup();
                if (!group) {
                    return;
                }
                const textbox = getGroupTextbox(group);
                textbox.set('textAlign', align);
                updateAlignButtonsState(align, group.verticalAlign);
                canvas.requestRenderAll();
                saveHistory();
            });
        });

        ['top', 'middle', 'bottom'].forEach(function (valign) {
            const button = document.getElementById('is_text_valign_' + valign);
            if (!button) {
                return;
            }
            button.addEventListener('click', function () {
                const group = getActiveTextGroup();
                if (!group) {
                    return;
                }
                group.set('verticalAlign', valign);
                layoutTextGroup(group);
                updateAlignButtonsState(getGroupTextbox(group).textAlign, valign);
                canvas.requestRenderAll();
                saveHistory();
            });
        });

        [widthInput, heightInput].forEach(function (input) {
            if (input) {
                input.addEventListener('change', function () {
                    updateCanvasDimensions();
                    applyBackground();
                });
            }
        });

        [bgColorInput, bgImageInput, bgFitInput].forEach(function (input) {
            if (input) {
                input.addEventListener('change', applyBackground);
            }
        });

        if (modeSelect) {
            modeSelect.addEventListener('change', onModeChange);
        }

        if (savedLayoutsSelect) {
            savedLayoutsSelect.addEventListener('change', openSelectedLayout);
        }

        const saveAsButton = document.getElementById('is_save_as');
        if (saveAsButton) {
            saveAsButton.addEventListener('click', saveImageSettingsAs);
        }

        const deleteLayoutButton = document.getElementById('is_delete_layout');
        if (deleteLayoutButton) {
            deleteLayoutButton.addEventListener('click', deleteSelectedLayout);
        }

        window.addEventListener('resize', fitCanvasToViewport);

        document.addEventListener('keydown', function (event) {
            if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
                event.preventDefault();
                if (event.shiftKey) {
                    redo();
                } else {
                    undo();
                }
            }
            if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') {
                event.preventDefault();
                redo();
            }
            if (event.key === 'Delete' || event.key === 'Backspace') {
                const targetTag = event.target && event.target.tagName;
                const isTypingInField = targetTag === 'INPUT' || targetTag === 'TEXTAREA' || (event.target && event.target.isContentEditable);
                const activeObject = canvas.getActiveObject();
                const isEditingText = activeObject && activeObject.isEditing;
                if (isTypingInField || isEditingText) {
                    return;
                }
                removeSelectedObject();
            }
        });

        window.saveImageSettings = saveImageSettings;
    }

    function initialize() {
        populateFontSelect();
        updateTextPanel();
        updateCanvasDimensions();
        applyBackground();
        refreshSavedLayoutsSelect();
        onModeChange();
    }

    bindEvents();
    initialize();
})();
