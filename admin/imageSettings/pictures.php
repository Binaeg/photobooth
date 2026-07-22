<?php
require_once '../../lib/boot.php';

use Photobooth\FileUploader;
use Photobooth\Service\LoggerService;
use Photobooth\Utility\ImageUtility;
use Photobooth\Utility\PathUtility;

if (!(
    !$config['login']['enabled'] ||
    (!$config['protect']['localhost_admin'] && isset($_SERVER['SERVER_ADDR']) && $_SERVER['REMOTE_ADDR'] === $_SERVER['SERVER_ADDR']) ||
    (isset($_SESSION['auth']) && $_SESSION['auth'] === true) ||
    !$config['protect']['admin']
)) {
    http_response_code(403);
    header('Content-Type: application/json');
    echo json_encode(['success' => false, 'message' => 'Not authorized.']);
    exit();
}

header('Content-Type: application/json');

const COLLAGE_IMAGES_FOLDER = 'private/images/collage';

$collageImagesDir = PathUtility::getAbsolutePath(COLLAGE_IMAGES_FOLDER);
if (!is_dir($collageImagesDir)) {
    mkdir($collageImagesDir, 0755, true);
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    if (!isset($_FILES['files'])) {
        echo json_encode(['success' => false, 'message' => 'No file uploaded.']);
        exit();
    }

    $logger = LoggerService::getInstance()->getLogger('main');
    $uploader = new FileUploader(COLLAGE_IMAGES_FOLDER, $_FILES['files'], $logger);
    $response = $uploader->uploadFiles();
    echo json_encode($response);
    exit();
}

$files = ImageUtility::getImagesFromPath(COLLAGE_IMAGES_FOLDER, false);
$images = array_map(static function (string $absolutePath): array {
    return [
        'name' => basename($absolutePath),
        'url' => PathUtility::getPublicPath($absolutePath),
    ];
}, $files);

echo json_encode(['success' => true, 'images' => $images]);
