<?php
require(__DIR__ . '/../../vendor/autoload.php');
require_once(__DIR__ . '/config.php');

use PhpMqtt\Client\MqttClient;
use PhpMqtt\Client\ConnectionSettings;

$initial_display_text = "Bitte scanne deine Karte";
$photo_display_text = "Mache ein Foto";

// Function to update display text
function updateDisplayText($text) {
    // This is a placeholder. In a real application, you would have a mechanism
    // to update the text on the photobooth display.
    // For example, writing to a file that the frontend reads.
    file_put_contents(__DIR__ . '/../../private/display_text.txt', $text);
    echo "Display text updated to: " . $text . "\n";
}

// Function to trigger photobooth capture
function takePhoto() {
    // This is a placeholder. In a real application, you would trigger the
    // photobooth's capture mechanism. This could be an API call or a shell command.
    echo "Starting photo capture process...\n";
    // Simulate photo taking process
    sleep(5);
    echo "Photo taken.\n";
    return true;
}

updateDisplayText($initial_display_text);

$connectionSettings = (new ConnectionSettings)
    ->setUsername($config['mqtt_user'])
    ->setPassword($config['mqtt_password']);

$mqtt = new MqttClient($config['mqtt_broker'], $config['mqtt_port'], 'photobooth-rfid-helper');

try {
    $mqtt->connect($connectionSettings, true);
    echo "Connected to MQTT broker.\n";

    $mqtt->subscribe($config['mqtt_topic_photobooth'], function ($topic, $message) use ($mqtt, $config, $photo_display_text) {
        echo "Received message on topic [{$topic}]: {$message}\n";
        
        // Simple check for a non-empty message, assuming it's an RFID UUID
        if (!empty($message)) {
            $rfid = $message;
            
            updateDisplayText($photo_display_text);
            
            if (takePhoto()) {
                echo "Publishing RFID to tasks topic.\n";
                $mqtt->publish($config['mqtt_topic_tasks'], $rfid, 0);
                echo "RFID {$rfid} sent to {$config['mqtt_topic_tasks']}.\n";
            }
            
            // Reset display text after a delay, ready for the next scan
            // The 120s logic is handled by the loop timeout below
            updateDisplayText($initial_display_text);
        }
    }, 0);

    // Loop to keep the script running and process messages.
    // The loop will run for 120 seconds to check for new messages.
    $mqtt->loop(true, true, 120);

    $mqtt->disconnect();
    echo "Disconnected from MQTT broker.\n";

} catch (\PhpMqtt\Client\Exceptions\MqttClientException $e) {
    echo "MQTT Client Error: " . $e->getMessage() . "\n";
}

?>