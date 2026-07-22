<?php
require_once '../../lib/boot.php';

use Photobooth\Service\ConfigurationService;
use Photobooth\Service\ApplicationService;
use Photobooth\Service\LanguageService;
use Photobooth\Service\AssetService;
use Photobooth\Utility\FontUtility;
use Photobooth\Utility\PathUtility;

if (!(
    !$config['login']['enabled'] ||
    (!$config['protect']['localhost_admin'] && isset($_SERVER['SERVER_ADDR']) && $_SERVER['REMOTE_ADDR'] === $_SERVER['SERVER_ADDR']) ||
    (isset($_SESSION['auth']) && $_SESSION['auth'] === true) ||
    !$config['protect']['admin']
)) {
    header('location: ' . PathUtility::getPublicPath('login'));
    exit();
}

$configurationService = ConfigurationService::getInstance();
$languageService = LanguageService::getInstance();
$assetService = AssetService::getInstance();

$error = false;
$success = false;
$warning = false;

$pageTitle = 'Image settings generator - ' . ApplicationService::getInstance()->getTitle();
include PathUtility::getAbsolutePath('admin/components/head.admin.php');
include PathUtility::getAbsolutePath('admin/helper/index.php');

$singleConfigPath = PathUtility::getAbsolutePath('private/image-settings-single.json');
$collageConfigPath = PathUtility::getAbsolutePath('private/collage.json');
$singleLayoutsDir = PathUtility::getAbsolutePath('private/image-settings/single');
$collageLayoutsDir = PathUtility::getAbsolutePath('private/image-settings/collage');

if (!is_dir($singleLayoutsDir)) {
    mkdir($singleLayoutsDir, 0755, true);
}
if (!is_dir($collageLayoutsDir)) {
    mkdir($collageLayoutsDir, 0755, true);
}

$listLayouts = static function (string $dir): array {
    $files = glob($dir . DIRECTORY_SEPARATOR . '*.json') ?: [];
    $names = array_map(static fn (string $file): string => basename($file), $files);
    sort($names);
    return $names;
};

$readLayoutMap = static function (string $dir, array $files): array {
    $map = [];
    foreach ($files as $file) {
        $path = $dir . DIRECTORY_SEPARATOR . $file;
        if (!is_file($path)) {
            continue;
        }
        $decoded = json_decode((string) file_get_contents($path), true);
        if (is_array($decoded)) {
            $map[$file] = $decoded;
        }
    }
    return $map;
};

$currentMode = 'single';
if (!empty($_POST['editor-mode']) && in_array($_POST['editor-mode'], ['single', 'collage'], true)) {
    $currentMode = $_POST['editor-mode'];
}

$layoutAction = !empty($_POST['layout-action']) && is_string($_POST['layout-action'])
    ? $_POST['layout-action']
    : 'save';

$selectedLayoutSingle = '';
$selectedLayoutCollage = '';
if (!empty($_POST['editor-layout-file-single']) && is_string($_POST['editor-layout-file-single'])) {
    $selectedLayoutSingle = $_POST['editor-layout-file-single'];
}
if (!empty($_POST['editor-layout-file-collage']) && is_string($_POST['editor-layout-file-collage'])) {
    $selectedLayoutCollage = $_POST['editor-layout-file-collage'];
}

$singleConfig = [];
$collageConfig = [];
if (file_exists($singleConfigPath)) {
    $decoded = json_decode((string) file_get_contents($singleConfigPath), true);
    if (is_array($decoded)) {
        $singleConfig = $decoded;
    }
}
if (file_exists($collageConfigPath)) {
    $decoded = json_decode((string) file_get_contents($collageConfigPath), true);
    if (is_array($decoded)) {
        $collageConfig = $decoded;
    }
}

$targetPath = $currentMode === 'collage' ? $collageConfigPath : $singleConfigPath;
$targetDir = dirname($targetPath);
$permitSubmit = (file_exists($targetPath) && is_writable($targetPath)) || (!file_exists($targetPath) && is_writable($targetDir));
$enableWriteMessage = $permitSubmit ? '' : $languageService->translate('collage:generator:please_enable_write');

if (isset($_POST['new-configuration'])) {
    $payload = (string) $_POST['new-configuration'];
    $decodedPayload = json_decode($payload, true);

    if (!is_array($decodedPayload)) {
        $error = true;
    } elseif (empty($decodedPayload['schemaVersion'])) {
        $error = true;
    } else {
        $mode = !empty($_POST['editor-mode']) && in_array($_POST['editor-mode'], ['single', 'collage'], true)
            ? $_POST['editor-mode']
            : 'single';

        $runtimePath = $mode === 'collage' ? $collageConfigPath : $singleConfigPath;
        $targetPath = $runtimePath;
        $targetDir = dirname($targetPath);

        $requestedLayoutFile = '';
        if ($mode === 'single' && !empty($_POST['editor-layout-file-single']) && is_string($_POST['editor-layout-file-single'])) {
            $requestedLayoutFile = $_POST['editor-layout-file-single'];
        }
        if ($mode === 'collage' && !empty($_POST['editor-layout-file-collage']) && is_string($_POST['editor-layout-file-collage'])) {
            $requestedLayoutFile = $_POST['editor-layout-file-collage'];
        }

        if ($requestedLayoutFile !== '') {
            $requestedLayoutFile = basename($requestedLayoutFile);
            $requestedLayoutFile = preg_replace('/[^A-Za-z0-9._-]/', '', $requestedLayoutFile) ?? '';
            if ($requestedLayoutFile !== '' && str_ends_with(strtolower($requestedLayoutFile), '.json') === false) {
                $requestedLayoutFile .= '.json';
            }

            if ($requestedLayoutFile !== '') {
                $targetBaseDir = $mode === 'collage' ? $collageLayoutsDir : $singleLayoutsDir;
                $targetPath = $targetBaseDir . DIRECTORY_SEPARATOR . $requestedLayoutFile;
                $targetDir = dirname($targetPath);
                if ($mode === 'single') {
                    $selectedLayoutSingle = $requestedLayoutFile;
                } else {
                    $selectedLayoutCollage = $requestedLayoutFile;
                }
            }
        }

        $canWrite = (file_exists($targetPath) && is_writable($targetPath)) || (!file_exists($targetPath) && is_writable($targetDir));

        if (!$canWrite) {
            $error = true;
        } else {
            $fp = fopen($targetPath, 'w');
            if ($fp === false) {
                $error = true;
            } else {
                fwrite($fp, $payload);
                fclose($fp);

                if ($targetPath !== $runtimePath) {
                    file_put_contents($runtimePath, $payload);
                }

                if ($mode === 'single') {
                    $singleConfig = $decodedPayload;
                } else {
                    $collageConfig = $decodedPayload;
                }

                if ($mode === 'collage') {
                    $objects = isset($decodedPayload['objects']) && is_array($decodedPayload['objects'])
                        ? $decodedPayload['objects']
                        : [];

                    $placeholderCount = count(array_filter($objects, static function ($object): bool {
                        return is_array($object)
                            && isset($object['type'])
                            && $object['type'] === 'placeholder';
                    }));

                    $newConfig = $config;
                    $newConfig['collage']['layout'] = 'collage.json';
                    $newConfig['collage']['limit'] = max(1, $placeholderCount);
                    $newConfig['collage']['placeholder'] = false;
                    $newConfig['collage']['placeholderposition'] = 1;
                    $newConfig['collage']['placeholderpath'] = '';

                    try {
                        $configurationService->update($newConfig);
                    } catch (\Exception $exception) {
                        $warning = true;
                    }
                }
            }
        }
    }

    $success = !($error || $warning);
}

if ($layoutAction === 'delete') {
    $mode = !empty($_POST['editor-mode']) && in_array($_POST['editor-mode'], ['single', 'collage'], true)
        ? $_POST['editor-mode']
        : 'single';
    $fileToDelete = '';
    if ($mode === 'single' && !empty($_POST['editor-layout-file-single']) && is_string($_POST['editor-layout-file-single'])) {
        $fileToDelete = basename($_POST['editor-layout-file-single']);
    }
    if ($mode === 'collage' && !empty($_POST['editor-layout-file-collage']) && is_string($_POST['editor-layout-file-collage'])) {
        $fileToDelete = basename($_POST['editor-layout-file-collage']);
    }

    if ($fileToDelete !== '') {
        $targetBaseDir = $mode === 'collage' ? $collageLayoutsDir : $singleLayoutsDir;
        $deletePath = $targetBaseDir . DIRECTORY_SEPARATOR . $fileToDelete;
        if (is_file($deletePath) && is_writable($deletePath)) {
            if (!unlink($deletePath)) {
                $warning = true;
            } else {
                if ($mode === 'single') {
                    $selectedLayoutSingle = '';
                } else {
                    $selectedLayoutCollage = '';
                }
                $success = true;
            }
        } else {
            $warning = true;
        }
    }
}

$singleLayoutFiles = $listLayouts($singleLayoutsDir);
$collageLayoutFiles = $listLayouts($collageLayoutsDir);
$singleLayoutMap = $readLayoutMap($singleLayoutsDir, $singleLayoutFiles);
$collageLayoutMap = $readLayoutMap($collageLayoutsDir, $collageLayoutFiles);

if ($selectedLayoutSingle === '' && !empty($singleLayoutFiles)) {
    $selectedLayoutSingle = $singleLayoutFiles[0];
}
if ($selectedLayoutCollage === '' && !empty($collageLayoutFiles)) {
    $selectedLayoutCollage = $collageLayoutFiles[0];
}

$singleConfigJson = htmlspecialchars(json_encode($singleConfig, JSON_UNESCAPED_SLASHES) ?: '{}', ENT_QUOTES);
$collageConfigJson = htmlspecialchars(json_encode($collageConfig, JSON_UNESCAPED_SLASHES) ?: '{}', ENT_QUOTES);
$singleLayoutFilesJson = htmlspecialchars(json_encode($singleLayoutFiles, JSON_UNESCAPED_SLASHES) ?: '[]', ENT_QUOTES);
$collageLayoutFilesJson = htmlspecialchars(json_encode($collageLayoutFiles, JSON_UNESCAPED_SLASHES) ?: '[]', ENT_QUOTES);
$singleLayoutMapJson = htmlspecialchars((empty($singleLayoutMap) ? '{}' : json_encode($singleLayoutMap, JSON_UNESCAPED_SLASHES)) ?: '{}', ENT_QUOTES);
$collageLayoutMapJson = htmlspecialchars((empty($collageLayoutMap) ? '{}' : json_encode($collageLayoutMap, JSON_UNESCAPED_SLASHES)) ?: '{}', ENT_QUOTES);

// Build the list of installed TTF fonts plus matching @font-face declarations, so the
// canvas preview renders text with the exact same font file used by the PHP/GD renderer.
$fontPaths = [
    PathUtility::getAbsolutePath('resources/fonts'),
    PathUtility::getAbsolutePath('private/fonts'),
];

$availableFonts = [];
$fontFaceStyles = '';
foreach ($fontPaths as $fontDir) {
    try {
        $files = FontUtility::getFontsFromPath($fontDir, false);
    } catch (\Exception $e) {
        continue;
    }

    foreach ($files as $name => $absoluteFontPath) {
        $origin = ltrim(str_replace(PathUtility::getRootPath(), '', $absoluteFontPath), '/');
        $publicUrl = PathUtility::getPublicPath($origin);
        $availableFonts[] = [
            'name' => $name,
            'origin' => $origin,
            'url' => $publicUrl,
        ];
        $fontFaceStyles .= '@font-face { font-family: "' . addslashes($name) . '"; src: url(' . $publicUrl . ') format("truetype"); }' . "\n";
    }
}

$availableFontsJson = htmlspecialchars(json_encode($availableFonts, JSON_UNESCAPED_SLASHES) ?: '[]', ENT_QUOTES);
?>
<style><?= $fontFaceStyles ?></style>

<div class="w-full h-screen bg-brand-2 px-3 md:px-6 py-6 md:py-12 overflow-x-hidden overflow-y-auto">
    <div class="w-full flex items-center justify-center flex-col">
        <div class="w-full max-w-[1600px] rounded-lg p-4 md:p-8 bg-white flex flex-col shadow-xl place-items-center relative">
            <div class="w-full text-center flex flex-col items-center justify-center text-2xl font-bold text-brand-1 mb-2">
                Image Settings Generator
            </div>
            <div class="w-full text-center text-sm text-slate-700 mb-6">
                Single mode: one captured photo slot. Collage mode: multiple slots.
            </div>

            <input id="single_config_json" type="hidden" value="<?= $singleConfigJson ?>" />
            <input id="collage_config_json" type="hidden" value="<?= $collageConfigJson ?>" />
            <input id="single_layout_files_json" type="hidden" value="<?= $singleLayoutFilesJson ?>" />
            <input id="collage_layout_files_json" type="hidden" value="<?= $collageLayoutFilesJson ?>" />
            <input id="single_layout_map_json" type="hidden" value="<?= $singleLayoutMapJson ?>" />
            <input id="collage_layout_map_json" type="hidden" value="<?= $collageLayoutMapJson ?>" />
            <input id="can_submit" type="hidden" value="<?= $permitSubmit ? '1' : '0' ?>" />
            <input id="enable_write_message" type="hidden" value="<?= htmlspecialchars($enableWriteMessage, ENT_QUOTES) ?>" />
            <input id="app_base_path" type="hidden" value="<?= PathUtility::getPublicPath('') ?>" />

            <div class="w-full flex flex-col gap-3">
                <div class="w-full p-3 rounded-md bg-slate-100 flex flex-wrap items-center gap-2 justify-between">
                    <div class="flex items-center gap-2">
                        <label class="font-semibold" for="image_settings_mode">Mode</label>
                        <select id="image_settings_mode" class="rounded border border-slate-300 p-2">
                            <option value="single" <?= $currentMode === 'single' ? 'selected' : '' ?>>Single shot</option>
                            <option value="collage" <?= $currentMode === 'collage' ? 'selected' : '' ?>>Collage</option>
                        </select>
                        <select id="image_settings_saved_layouts" class="rounded border border-slate-300 p-2 min-w-56"></select>
                    </div>
                    <div class="flex flex-wrap items-end gap-4">
                        <div class="flex flex-col gap-1">
                            <span class="text-xs font-semibold uppercase tracking-wide text-slate-500">Layout</span>
                            <div class="flex items-center gap-2">
                                <button id="is_open_layout" type="button" title="Open" class="w-10 h-10 rounded bg-slate-200 text-slate-700 font-semibold"><i class="fa fa-folder-open"></i></button>
                                <button id="is_save_as" type="button" title="Save As" class="w-10 h-10 rounded bg-slate-200 text-slate-700 font-semibold"><i class="fa fa-copy"></i></button>
                                <button id="is_delete_layout" type="button" title="Delete Layout" class="w-10 h-10 rounded bg-red-200 text-red-900 font-semibold"><i class="fa fa-trash"></i></button>
                                <button id="is_canvas_settings" type="button" title="Canvas Settings" class="w-10 h-10 rounded bg-slate-200 text-slate-700 font-semibold"><i class="fa fa-sliders"></i></button>
                            </div>
                        </div>

                        <div class="flex flex-col gap-1 border-l border-slate-300 pl-4">
                            <span class="text-xs font-semibold uppercase tracking-wide text-blue-600">Instanz (pro Foto)</span>
                            <div class="flex items-center gap-2">
                                <button id="is_add_placeholder" type="button" title="Add Placeholder" class="w-10 h-10 rounded border-2 border-dashed border-blue-600 bg-blue-100 text-blue-900 font-semibold"><i class="fa fa-image"></i></button>
                            </div>
                        </div>

                        <div class="flex flex-col gap-1 border-l border-slate-300 pl-4">
                            <span class="text-xs font-semibold uppercase tracking-wide text-violet-600">Vorlage (statisch)</span>
                            <div class="flex items-center gap-2">
                                <button id="is_add_text" type="button" title="Add Text" class="w-10 h-10 rounded bg-violet-100 text-violet-900 font-semibold"><i class="fa fa-font"></i></button>
                                <button id="is_add_picture" type="button" title="Add Picture" class="w-10 h-10 rounded bg-violet-100 text-violet-900 font-semibold"><i class="fa fa-photo-film"></i></button>
                            </div>
                        </div>

                        <div class="flex flex-col gap-1 border-l border-slate-300 pl-4">
                            <span class="text-xs font-semibold uppercase tracking-wide text-slate-500">Bearbeiten</span>
                            <div class="flex items-center gap-2">
                                <button id="is_delete_selected" type="button" title="Delete Selected" class="w-10 h-10 rounded bg-rose-200 text-rose-900 font-semibold"><i class="fa fa-trash-can"></i></button>
                                <button id="is_undo" type="button" title="Undo" class="w-10 h-10 rounded bg-slate-200 text-slate-700 font-semibold" disabled><i class="fa fa-rotate-left"></i></button>
                                <button id="is_redo" type="button" title="Redo" class="w-10 h-10 rounded bg-slate-200 text-slate-700 font-semibold" disabled><i class="fa fa-rotate-right"></i></button>
                            </div>
                        </div>
                    </div>
                </div>

                <div id="text_properties_panel" class="hidden w-full p-3 rounded-md bg-violet-50 border border-violet-200 flex flex-wrap items-end gap-4">
                    <span class="text-xs font-semibold uppercase tracking-wide text-violet-600 w-full">Text bearbeiten</span>
                    <div class="flex flex-col gap-1 w-full md:w-64">
                        <label class="text-xs font-semibold text-slate-600" for="is_text_content">Text</label>
                        <textarea id="is_text_content" rows="2" class="rounded border border-slate-300 p-2"></textarea>
                    </div>
                    <div class="flex flex-col gap-1">
                        <label class="text-xs font-semibold text-slate-600" for="is_text_font">Schriftart</label>
                        <select id="is_text_font" class="rounded border border-slate-300 p-2 min-w-40"></select>
                    </div>
                    <div class="flex flex-col gap-1">
                        <label class="text-xs font-semibold text-slate-600" for="is_text_size">Größe</label>
                        <input id="is_text_size" type="number" min="1" class="w-20 rounded border border-slate-300 p-2" />
                    </div>
                    <div class="flex flex-col gap-1">
                        <label class="text-xs font-semibold text-slate-600" for="is_text_color">Farbe</label>
                        <input id="is_text_color" type="color" class="w-12 h-10 rounded border border-slate-300 p-1" />
                    </div>
                    <div class="flex flex-col gap-1">
                        <span class="text-xs font-semibold text-slate-600">Ausrichtung</span>
                        <div class="flex items-center gap-1">
                            <button id="is_text_align_left" type="button" title="Left" class="w-9 h-9 rounded bg-white border border-slate-300"><i class="fa fa-align-left"></i></button>
                            <button id="is_text_align_center" type="button" title="Center" class="w-9 h-9 rounded bg-white border border-slate-300"><i class="fa fa-align-center"></i></button>
                            <button id="is_text_align_right" type="button" title="Right" class="w-9 h-9 rounded bg-white border border-slate-300"><i class="fa fa-align-right"></i></button>
                        </div>
                    </div>
                    <div class="flex flex-col gap-1">
                        <span class="text-xs font-semibold text-slate-600">Vertikal</span>
                        <div class="flex items-center gap-1">
                            <button id="is_text_valign_top" type="button" title="Top" class="w-9 h-9 rounded bg-white border border-slate-300"><i class="fa fa-arrow-up-to-line"></i></button>
                            <button id="is_text_valign_middle" type="button" title="Middle" class="w-9 h-9 rounded bg-white border border-slate-300"><i class="fa fa-arrows-up-down"></i></button>
                            <button id="is_text_valign_bottom" type="button" title="Bottom" class="w-9 h-9 rounded bg-white border border-slate-300"><i class="fa fa-arrow-down-to-line"></i></button>
                        </div>
                    </div>
                </div>

                <input id="available_fonts_json" type="hidden" value="<?= $availableFontsJson ?>" />
                <input id="image_settings_width" type="hidden" min="100" value="1500" />
                <input id="image_settings_height" type="hidden" min="100" value="1000" />
                <input id="image_settings_background_color" type="hidden" value="#ffffff" />
                <input id="image_settings_background_image" type="hidden" value="" />
                <input id="image_settings_background_fit" type="hidden" value="cover" />

                <div id="image_settings_editor" class="w-full h-full min-h-[72vh] flex flex-col gap-2">
                    <div class="text-xs text-slate-700">Placeholders and pictures resize from corners, keeping their aspect ratio. Text boxes resize freely from any handle. Select a text box to edit its content, font, size, color and alignment below. Rotation is enabled for every object.</div>
                    <div id="image_settings_canvas_viewport" class="w-full h-[72vh] overflow-hidden border-2 border-slate-400 rounded bg-white p-2 flex items-center justify-center">
                        <canvas id="image_settings_canvas" class="shadow-xl"></canvas>
                    </div>
                </div>
            </div>
        </div>

        <button onclick="saveImageSettings()" class="mt-6 w-20 h-20 rounded-full bg-blue-300 flex flex-row items-center justify-center">
            <i class="fa fa-save fa-2xl"></i>
        </button>

        <form id="image_settings_form" action="<?php echo $_SERVER['PHP_SELF']; ?>" method="POST" enctype="multipart/form-data" class="hidden">
            <input id="editor_mode_input" type="hidden" name="editor-mode" value="<?= htmlspecialchars($currentMode, ENT_QUOTES) ?>" />
            <input id="editor_layout_file_single" type="hidden" name="editor-layout-file-single" value="<?= htmlspecialchars($selectedLayoutSingle, ENT_QUOTES) ?>" />
            <input id="editor_layout_file_collage" type="hidden" name="editor-layout-file-collage" value="<?= htmlspecialchars($selectedLayoutCollage, ENT_QUOTES) ?>" />
            <input id="editor_layout_action" type="hidden" name="layout-action" value="save" />
            <input id="editor_payload_input" type="hidden" name="new-configuration" value="" />
        </form>

        <div class="w-full max-w-xl my-12 border-b border-solid border-white border-opacity-20"></div>
        <div class="w-full max-w-xl rounded-lg py-8 bg-white flex flex-col shadow-xl relative">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4 px-4 ">
                <?php
                echo getMenuBtn(PathUtility::getPublicPath('admin'), 'admin_panel', $config['icons']['admin']);
                echo getMenuBtn(PathUtility::getPublicPath('test/collage.php'), 'collageTest', $config['icons']['take_collage'], true);

                if (isset($_SESSION['auth']) && $_SESSION['auth'] === true) {
                    echo getMenuBtn(PathUtility::getPublicPath('login/logout.php'), 'logout', $config['icons']['logout']);
                }
                ?>
            </div>
        </div>
    </div>
</div>

<?php
include PathUtility::getAbsolutePath('admin/components/footer.scripts.php');
echo '<script src="' . $assetService->getUrl('node_modules/fabric/dist/index.min.js') . '"></script>';
echo '<script src="' . $assetService->getUrl('assets/js/admin/image-settings.js') . '"></script>';

if ($success) {
    echo '<script>setTimeout(function(){openToast("Configuration saved")},500);</script>';
}
if ($error !== false) {
    echo '<script>setTimeout(function(){openToast("Error during configuration saving", "isError", 5000)},500);</script>';
}
if ($warning) {
    echo '<script>setTimeout(function(){openToast("Configuration saved, but update config in admin too.", "isWarning", 5000)},500);</script>';
}

include PathUtility::getAbsolutePath('admin/components/footer.admin.php');
