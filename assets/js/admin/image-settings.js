/* globals fabric, photoboothTools */
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
        selection: true
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

    const photoAspectRatio = 2 / 3;

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
        const ratio = getPhotoAspectRatio();
        if (!ratio) {
            return { width: 320, height: 220 };
        }

        const dimensions = getCanvasDimensions();
        const defaultWidth = Math.min(dimensions.width * 0.4, 320 * Math.max(ratio, 1));
        return {
            width: Math.round(defaultWidth),
            height: Math.round(defaultWidth / ratio)
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

    function createTextObject(textValue, left, top, angle, fontSize, color, fontPath) {
        const object = new fabric.Textbox(textValue || 'Your text', {
            objectType: 'text',
            originX: 'left',
            originY: 'top',
            left: numberOr(left, 100),
            top: numberOr(top, 100),
            angle: numberOr(angle, 0),
            width: 360,
            fontSize: numberOr(fontSize, 56),
            fill: color || '#111111',
            fontFamily: 'sans-serif',
            fontPath: fontPath || '',
            borderColor: '#f97316',
            cornerColor: '#ea580c'
        });

        setCornerOnlyControls(object);
        return object;
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

                const targetWidth = Math.max(80, numberOr(width, 300));
                const targetHeight = Math.max(80, numberOr(height, 220));
                const nativeWidth = img.width || targetWidth;
                const nativeHeight = img.height || targetHeight;
                img.set({
                    scaleX: targetWidth / nativeWidth,
                    scaleY: targetHeight / nativeHeight
                });

                setCornerOnlyControls(img);
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

        const obj = createPlaceholderObject(80 + historyIndex * 3, 80 + historyIndex * 3, 320, 220, 0, placeholderCounter);
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

    function addPicture() {
        const source = prompt('Image path or URL', '/resources/img/demo/01.jpg');
        if (!source) {
            return;
        }

        createPictureObject(source, 140, 140, 300, 220, 0, function (img) {
            canvas.add(img);
            canvas.setActiveObject(img);
            canvas.requestRenderAll();
        });
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

        const snapshot = JSON.stringify(canvas.toObject(['objectType', 'placeholderIndex', 'fontPath', 'sourcePath', 'lockAspectRatio']));
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
            canvas.getObjects().forEach(setCornerOnlyControls);
            canvas.requestRenderAll();
            restoringState = false;
            historyIndex = index;
            updateHistoryButtons();
            recomputePlaceholderCounter();
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
            return {
                type: 'text',
                x: Math.round(obj.left || 0),
                y: Math.round(obj.top || 0),
                width,
                height,
                rotation: Math.round(obj.angle || 0),
                zIndex,
                text: obj.text || '',
                fontPath: obj.fontPath || '',
                fontSize: Math.round(obj.fontSize || 56),
                color: obj.fill || '#111111'
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
                const text = createTextObject(item.text, item.x, item.y, item.rotation, item.fontSize, item.color, item.fontPath);
                if (item.width && item.width > 0) {
                    text.set({ width: item.width });
                }
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

    function openCanvasSettingsDialog() {
        const currentWidth = getCanvasDimensions().width;
        const currentHeight = getCanvasDimensions().height;
        const currentBackground = getBackgroundPayload();

        const nextWidth = prompt('Canvas width', String(currentWidth));
        if (nextWidth === null) {
            return;
        }
        const nextHeight = prompt('Canvas height', String(currentHeight));
        if (nextHeight === null) {
            return;
        }
        const nextColor = prompt('Background color (#RRGGBB)', currentBackground.color || '#ffffff');
        if (nextColor === null) {
            return;
        }
        const nextImage = prompt('Background image path (optional)', currentBackground.image || '');
        if (nextImage === null) {
            return;
        }
        const nextFit = prompt('Background fit: cover | contain | stretch', currentBackground.fitMode || 'cover');
        if (nextFit === null) {
            return;
        }

        if (widthInput) {
            widthInput.value = String(clampNumber(nextWidth, 100, currentWidth));
        }
        if (heightInput) {
            heightInput.value = String(clampNumber(nextHeight, 100, currentHeight));
        }
        if (bgColorInput) {
            bgColorInput.value = nextColor.trim() || '#ffffff';
        }
        if (bgImageInput) {
            bgImageInput.value = nextImage.trim();
        }
        if (bgFitInput) {
            const normalizedFit = ['cover', 'contain', 'stretch'].includes(nextFit.trim()) ? nextFit.trim() : 'cover';
            bgFitInput.value = normalizedFit;
        }

        updateCanvasDimensions();
        applyBackground();
    }

    function openSelectedLayout() {
        if (!savedLayoutsSelect) {
            return;
        }

        const fileName = savedLayoutsSelect.value;
        setSelectedLayoutFileName(fileName);
        const layoutMap = getSavedLayoutMap();
        const selectedLayout = layoutMap[fileName];
        if (!selectedLayout) {
            return;
        }

        loadDocument(selectedLayout, true);
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
        const bounds = target.getBoundingRect();

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
        canvas.on('object:removed', saveHistory);

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

        const deleteButton = document.getElementById('is_delete_selected');
        if (deleteButton) {
            deleteButton.addEventListener('click', removeSelectedObject);
        }

        const undoButton = document.getElementById('is_undo');
        if (undoButton) {
            undoButton.addEventListener('click', undo);
        }

        const redoButton = document.getElementById('is_redo');
        if (redoButton) {
            redoButton.addEventListener('click', redo);
        }

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
            savedLayoutsSelect.addEventListener('change', function () {
                setSelectedLayoutFileName(savedLayoutsSelect.value);
            });
        }

        const openLayoutButton = document.getElementById('is_open_layout');
        if (openLayoutButton) {
            openLayoutButton.addEventListener('click', openSelectedLayout);
        }

        const saveAsButton = document.getElementById('is_save_as');
        if (saveAsButton) {
            saveAsButton.addEventListener('click', saveImageSettingsAs);
        }

        const deleteLayoutButton = document.getElementById('is_delete_layout');
        if (deleteLayoutButton) {
            deleteLayoutButton.addEventListener('click', deleteSelectedLayout);
        }

        const canvasSettingsButton = document.getElementById('is_canvas_settings');
        if (canvasSettingsButton) {
            canvasSettingsButton.addEventListener('click', openCanvasSettingsDialog);
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
                removeSelectedObject();
            }
        });

        window.saveImageSettings = saveImageSettings;
    }

    function initialize() {
        updateCanvasDimensions();
        applyBackground();
        refreshSavedLayoutsSelect();
        onModeChange();
    }

    bindEvents();
    initialize();
})();
