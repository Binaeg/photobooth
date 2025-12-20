<!-- Setup Modal -->
<div id="setupModal" class="setup-modal">
    <div class="setup-modal__overlay"></div>
    <div class="setup-modal__content">
        <div class="setup-modal__header">
            <h2>Herzlich Willkommen bei deiner Fotobox</h2>
        </div>
        <div class="setup-modal__body">
            <p>Um die Fotobox einzurichten, muss einmal zu Beginn die Kamera fokussiert werden. Es wird ein Foto gemacht. Bitte platziere dich so, wie später die Fotobox genutzt wird.</p>
            <div id="setupCountdown" class="setup-modal__countdown" style="display: none;">
                <div class="setup-modal__countdown-number">5</div>
                <div class="setup-modal__countdown-text">Sekunden bis zur Aufnahme</div>
            </div>
            <div id="setupMessage" class="setup-modal__message"></div>
        </div>
        <div class="setup-modal__footer">
            <button id="setupAutofocusBtn" class="setup-modal__button">
                <i class="fa fa-camera"></i> Kamera fokussieren
            </button>
        </div>
    </div>
</div>
