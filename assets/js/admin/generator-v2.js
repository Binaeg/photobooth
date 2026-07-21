/* globals fabric, photoboothTools */
(function () {
    'use strict';

    const editorRoot = document.getElementById('collage_v2_editor');
    if (!editorRoot || typeof fabric === 'undefined') {
        return;
    }

    const canvasElementId = 'collage_v2_canvas';
    const maxHistoryEntries = 50;
    const history = [];
    let historyIndex = -1;
    let restoringState = false;
    let placeholderCounter = 1;
    let photoPreviewEnabled = false;

    const canvas = new fabric.Canvas(canvasElementId, {
        preserveObjectStacking: true,
        selection: true
    });

    function getAppBasePath() {
        const input = document.getElementById('app_base_path');
        return input && input.value ? input.value : '/';
    }

    function getDemoImages() {
        const input = document.getElementById('v2_demo_images');
        if (!input || !input.value) {
            return [];
        }
        try {
            const parsed = JSON.parse(input.value);
            return Array.isArray(parsed) ? parsed : [];
        } catch (error) {
            return [];
        }
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

    function getCanvasDimensions() {
        const widthInput = document.querySelector('input[name="final_width"]');
        const heightInput = document.querySelector('input[name="final_height"]');

        const width = clampNumber(widthInput ? widthInput.value : 1500, 100, 1500);
        const height = clampNumber(heightInput ? heightInput.value : 1000, 100, 1000);

        return { width, height };
    }

    function updateCanvasDimensions() {
        const dimensions = getCanvasDimensions();
        canvas.setWidth(dimensions.width);
        canvas.setHeight(dimensions.height);
        canvas.calcOffset();
        canvas.requestRenderAll();
    }

    function getBackgroundPayload() {
        const colorInput = document.querySelector('input[name="background_color"]');
        const imageInput = document.querySelector('input[name="generator-background"]');
        const fitModeInput = document.querySelector('select[name="v2_background_fit"]');

        return {
            color: colorInput ? colorInput.value : '#FFFFFF',
            image: imageInput ? imageInput.value : '',
            fitMode: fitModeInput ? fitModeInput.value : 'cover'
        };
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
            fontSize: 26,
            fill: '#1f2937',
            originX: 'center',
            originY: 'center',
            top: 0,
            left: 0,
            selectable: false,
            evented: false
        });
    }

    function createPlaceholderObject(left, top, width, height, angle, index) {
        const safeWidth = Math.max(120, width || 320);
        const safeHeight = Math.max(120, height || 220);
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
            left: left || 80,
            top: top || 80,
            angle: angle || 0,
            objectType: 'placeholder',
            placeholderIndex: safeIndex,
            borderColor: '#2563eb',
            cornerColor: '#1d4ed8',
            cornerStyle: 'circle',
            transparentCorners: false,
            padding: 8
        });

        return group;
    }

    function loadImageElement(url) {
        return new Promise(function (resolve, reject) {
            const imgEl = new Image();
            imgEl.crossOrigin = 'anonymous';
            imgEl.onload = function () {
                resolve(imgEl);
            };
            imgEl.onerror = reject;
            imgEl.src = url;
        });
    }

    function buildCoverPatternSource(imgEl, width, height) {
        const patternCanvas = document.createElement('canvas');
        patternCanvas.width = Math.max(1, Math.round(width));
        patternCanvas.height = Math.max(1, Math.round(height));
        const ctx = patternCanvas.getContext('2d');
        const scale = Math.max(width / imgEl.width, height / imgEl.height);
        const drawWidth = imgEl.width * scale;
        const drawHeight = imgEl.height * scale;
        const offsetX = (width - drawWidth) / 2;
        const offsetY = (height - drawHeight) / 2;
        ctx.drawImage(imgEl, offsetX, offsetY, drawWidth, drawHeight);
        return patternCanvas;
    }

    function applyPhotoPreviewToPlaceholder(group, imgEl) {
        const box = group._objects[0];
        const label = group._objects[1];
        const source = buildCoverPatternSource(imgEl, box.width, box.height);
        box.set('fill', new fabric.Pattern({ source: source, repeat: 'no-repeat' }));
        if (label) {
            label.set('visible', false);
        }
    }

    function clearPhotoPreviewFromPlaceholder(group) {
        const box = group._objects[0];
        const label = group._objects[1];
        box.set('fill', '#dbeafe');
        if (label) {
            label.set('visible', true);
        }
    }

    function updatePhotoPreviewButton() {
        const button = document.getElementById('v2_toggle_photo_preview');
        if (button) {
            button.textContent = photoPreviewEnabled ? 'Hide Photos' : 'Preview Photos';
        }
    }

    function togglePhotoPreview() {
        const placeholders = canvas.getObjects().filter(function (obj) {
            return obj.objectType === 'placeholder';
        });
        const demoImages = getDemoImages();

        if (!photoPreviewEnabled && demoImages.length === 0) {
            return;
        }

        photoPreviewEnabled = !photoPreviewEnabled;

        if (photoPreviewEnabled) {
            Promise.all(placeholders.map(function (group, i) {
                const url = demoImages[i % demoImages.length];
                return loadImageElement(url)
                    .then(function (imgEl) {
                        applyPhotoPreviewToPlaceholder(group, imgEl);
                    })
                    .catch(function (error) {
                        console.log('Unable to load demo image for placeholder preview', error);
                    });
            })).then(function () {
                canvas.requestRenderAll();
            });
        } else {
            placeholders.forEach(clearPhotoPreviewFromPlaceholder);
            canvas.requestRenderAll();
        }

        updatePhotoPreviewButton();
    }

    function createTextObject(textValue, left, top, angle, fontSize, color, fontPath) {
        const content = textValue || 'Double-click to edit';
        const text = new fabric.Textbox(content, {
            objectType: 'text',
            left: left || 100,
            top: top || 100,
            angle: angle || 0,
            width: 380,
            fontSize: fontSize || 56,
            fill: color || '#111111',
            fontFamily: 'sans-serif',
            fontPath: fontPath || '',
            borderColor: '#f97316',
            cornerColor: '#ea580c',
            cornerStyle: 'circle',
            transparentCorners: false,
            padding: 8
        });

        return text;
    }

    function getSelectedFontPath() {
        const input = document.querySelector('input[name="text_font_family"]');
        return input ? input.value : '';
    }

    function addPlaceholder() {
        const obj = createPlaceholderObject(80 + historyIndex * 3, 80 + historyIndex * 3, 320, 220, 0, placeholderCounter);
        placeholderCounter += 1;
        canvas.add(obj);
        canvas.setActiveObject(obj);
        canvas.requestRenderAll();

        if (photoPreviewEnabled) {
            const demoImages = getDemoImages();
            if (demoImages.length > 0) {
                loadImageElement(demoImages[0]).then(function (imgEl) {
                    applyPhotoPreviewToPlaceholder(obj, imgEl);
                    canvas.requestRenderAll();
                }).catch(function () {});
            }
        }
    }

    function addText() {
        const fontPath = getSelectedFontPath();
        const colorInput = document.querySelector('input[name="text_font_color"]');
        const fontSizeInput = document.querySelector('input[name="text_font_size"]');
        const text = createTextObject(
            'Your text',
            120 + historyIndex * 2,
            120 + historyIndex * 2,
            0,
            clampNumber(fontSizeInput ? fontSizeInput.value : 56, 6, 56),
            colorInput ? colorInput.value : '#111111',
            fontPath
        );

        canvas.add(text);
        canvas.setActiveObject(text);
        canvas.requestRenderAll();
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

        const snapshot = JSON.stringify(canvas.toObject(['objectType', 'placeholderIndex', 'fontPath']));
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
        if (obj.objectType === 'placeholder') {
            const scaleX = obj.scaleX || 1;
            const scaleY = obj.scaleY || 1;
            return {
                id: obj.id || '',
                type: 'placeholder',
                x: Math.round(obj.left || 0),
                y: Math.round(obj.top || 0),
                width: Math.round((obj.width || 0) * scaleX),
                height: Math.round((obj.height || 0) * scaleY),
                rotation: Math.round(obj.angle || 0),
                zIndex,
                placeholderIndex: obj.placeholderIndex || zIndex + 1,
                frameEnabled: false
            };
        }

        if (obj.objectType === 'text') {
            const textObj = obj;
            return {
                id: textObj.id || '',
                type: 'text',
                x: Math.round(textObj.left || 0),
                y: Math.round(textObj.top || 0),
                width: Math.round((textObj.width || 0) * (textObj.scaleX || 1)),
                height: Math.round((textObj.height || 0) * (textObj.scaleY || 1)),
                rotation: Math.round(textObj.angle || 0),
                zIndex,
                text: textObj.text || '',
                fontPath: textObj.fontPath || getSelectedFontPath(),
                fontSize: Math.round(textObj.fontSize || 56),
                color: textObj.fill || '#111111'
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
            schemaVersion: 2,
            width: dimensions.width,
            height: dimensions.height,
            frame: {
                path: document.querySelector('input[name="generator-frame"]') ? document.querySelector('input[name="generator-frame"]').value : '',
                mode: document.querySelector('select[name="apply_frame"]') ? document.querySelector('select[name="apply_frame"]').value : 'off'
            },
            background: {
                color: background.color,
                image: background.image,
                fitMode: background.fitMode
            },
            objects
        };
    }

    function loadDocument(documentData) {
        if (!documentData || Number(documentData.schemaVersion) !== 2) {
            return false;
        }

        const widthInput = document.querySelector('input[name="final_width"]');
        const heightInput = document.querySelector('input[name="final_height"]');
        if (widthInput) {
            widthInput.value = documentData.width || widthInput.value;
        }
        if (heightInput) {
            heightInput.value = documentData.height || heightInput.value;
        }

        const bgColorInput = document.querySelector('input[name="background_color"]');
        const bgImageInput = document.querySelector('input[name="generator-background"]');
        const bgFitInput = document.querySelector('select[name="v2_background_fit"]');
        if (bgColorInput) {
            bgColorInput.value = documentData.background && documentData.background.color ? documentData.background.color : bgColorInput.value;
        }
        if (bgImageInput) {
            bgImageInput.value = documentData.background && documentData.background.image ? documentData.background.image : '';
        }
        if (bgFitInput && documentData.background && documentData.background.fitMode) {
            bgFitInput.value = documentData.background.fitMode;
        }

        updateCanvasDimensions();
        canvas.clear();
        applyBackground();

        const objects = Array.isArray(documentData.objects) ? documentData.objects : [];
        objects
            .sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0))
            .forEach((item) => {
                if (item.type === 'placeholder') {
                    const placeholder = createPlaceholderObject(
                        item.x,
                        item.y,
                        item.width,
                        item.height,
                        item.rotation,
                        item.placeholderIndex
                    );
                    canvas.add(placeholder);
                }

                if (item.type === 'text') {
                    const text = createTextObject(
                        item.text,
                        item.x,
                        item.y,
                        item.rotation,
                        item.fontSize,
                        item.color,
                        item.fontPath
                    );
                    if (item.width && item.width > 0) {
                        text.set({ width: item.width });
                    }
                    canvas.add(text);
                }
            });

        recomputePlaceholderCounter();
        canvas.requestRenderAll();
        saveHistory();
        return true;
    }

    function saveConfiguration() {
        const canSubmit = document.getElementById('can_submit');
        const documentPayload = JSON.stringify(buildEditorDocument(), null, 2);

        if (canSubmit && canSubmit.value === '1') {
            const target = document.querySelector('input[name="new-configuration"]');
            if (target) {
                target.value = documentPayload;
            }
            const form = document.getElementById('configuration_form');
            if (form) {
                form.submit();
            }
            return;
        }

        photoboothTools.modal.open();
        const modalBody = photoboothTools.modal.element.querySelector('.modal-body');
        const enableWriteMessage = document.getElementById('enable_write_message');

        const messageDiv = document.createElement('div');
        messageDiv.innerText = enableWriteMessage ? enableWriteMessage.value : 'Configuration file is not writeable.';
        modalBody.appendChild(messageDiv);

        const jsonDiv = document.createElement('div');
        jsonDiv.innerText = documentPayload;
        jsonDiv.style.fontFamily = 'monospace';
        modalBody.appendChild(jsonDiv);
    }

    function updateHistoryButtons() {
        const undoButton = document.getElementById('v2_undo');
        const redoButton = document.getElementById('v2_redo');
        if (undoButton) {
            undoButton.disabled = historyIndex <= 0;
        }
        if (redoButton) {
            redoButton.disabled = historyIndex >= history.length - 1;
        }
    }

    function bindEvents() {
        canvas.on('object:added', saveHistory);
        canvas.on('object:modified', saveHistory);
        canvas.on('object:removed', saveHistory);

        const addTextButton = document.getElementById('v2_add_text');
        if (addTextButton) {
            addTextButton.addEventListener('click', addText);
        }

        const addPlaceholderButton = document.getElementById('v2_add_placeholder');
        if (addPlaceholderButton) {
            addPlaceholderButton.addEventListener('click', addPlaceholder);
        }

        const deleteButton = document.getElementById('v2_delete_selected');
        if (deleteButton) {
            deleteButton.addEventListener('click', removeSelectedObject);
        }

        const photoPreviewButton = document.getElementById('v2_toggle_photo_preview');
        if (photoPreviewButton) {
            photoPreviewButton.addEventListener('click', togglePhotoPreview);
        }

        const undoButton = document.getElementById('v2_undo');
        if (undoButton) {
            undoButton.addEventListener('click', undo);
        }

        const redoButton = document.getElementById('v2_redo');
        if (redoButton) {
            redoButton.addEventListener('click', redo);
        }

        const widthInput = document.querySelector('input[name="final_width"]');
        const heightInput = document.querySelector('input[name="final_height"]');
        if (widthInput) {
            widthInput.addEventListener('change', function () {
                updateCanvasDimensions();
                applyBackground();
            });
        }
        if (heightInput) {
            heightInput.addEventListener('change', function () {
                updateCanvasDimensions();
                applyBackground();
            });
        }

        ['background_color', 'generator-background', 'v2_background_fit'].forEach(function (name) {
            const input = document.querySelector('[name="' + name + '"]');
            if (input) {
                input.addEventListener('change', applyBackground);
            }
        });

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

        window.saveConfiguration = saveConfiguration;
    }

    function initializeCanvas() {
        updateCanvasDimensions();
        applyBackground();

        const currentConfigInput = document.getElementById('current_config');
        if (currentConfigInput && currentConfigInput.value) {
            try {
                const parsed = JSON.parse(currentConfigInput.value);
                if (loadDocument(parsed)) {
                    return;
                }
            } catch (error) {
                console.log('Unable to parse v2 config', error);
            }
        }

        addPlaceholder();
        addText();
        saveHistory();
    }

    bindEvents();
    initializeCanvas();
})();
