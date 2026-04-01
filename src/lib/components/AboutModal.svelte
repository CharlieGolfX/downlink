<script lang="ts">
    import { modalOpen } from "$lib/stores/ui";
    import { openUrl } from "@tauri-apps/plugin-opener";

    let {
        open = $bindable(false),
    }: {
        open: boolean;
    } = $props();

    $effect(() => {
        modalOpen.set(open);
    });

    function close() {
        open = false;
    }

    function handleBackdropClick(e: MouseEvent) {
        if (e.target === e.currentTarget) {
            close();
        }
    }

    function handleKeydown(e: KeyboardEvent) {
        if (e.key === "Escape") {
            close();
        }
    }

    function handleLinkClick(url: string) {
        openUrl(url);
    }
</script>

{#if open}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
        class="backdrop"
        onclick={handleBackdropClick}
        onkeydown={handleKeydown}
    >
        <div
            class="modal"
            role="dialog"
            aria-modal="true"
            aria-label="About Downlink"
        >
            <header class="modal-header">
                <h2>About Downlink</h2>
                <button class="close-btn" onclick={close} aria-label="Close"
                    >&times;</button
                >
            </header>

            <div class="body">
                <section class="section">
                    <h3 class="section-title">Developer</h3>
                    <div class="info-list">
                        <div class="info-row">
                            <span class="info-label">Developer</span>
                            <span class="info-value">Mats Bodding</span>
                        </div>
                        <div class="info-row">
                            <span class="info-label">Contact</span>
                            <span class="info-value">
                                <button
                                    class="link-btn"
                                    onclick={() =>
                                        handleLinkClick(
                                            "mailto:contact@cgx.no",
                                        )}>contact@cgx.no</button
                                >
                            </span>
                        </div>
                        <div class="info-row">
                            <span class="info-label">Website</span>
                            <span class="info-value">
                                <button
                                    class="link-btn"
                                    onclick={() =>
                                        handleLinkClick("https://apps.cgx.no")}
                                    >apps.cgx.no</button
                                >
                            </span>
                        </div>
                    </div>
                </section>

                <section class="section">
                    <h3 class="section-title">Project</h3>
                    <div class="info-list">
                        <div class="info-row">
                            <span class="info-label">GitHub</span>
                            <span class="info-value">
                                <button
                                    class="link-btn"
                                    onclick={() =>
                                        handleLinkClick(
                                            "https://github.com/charliegolfxray/downlink",
                                        )}>charliegolfxray/downlink</button
                                >
                            </span>
                        </div>
                    </div>
                    <p class="project-note">
                        Downlink is an open-source RSS reader built with Tauri
                        &amp; SvelteKit.
                    </p>
                </section>

                <footer class="modal-footer">
                    <button type="button" class="btn btn-cancel" onclick={close}
                        >Close</button
                    >
                </footer>
            </div>
        </div>
    </div>
{/if}

<style>
    .backdrop {
        position: fixed;
        inset: 0;
        z-index: 100;
        display: flex;
        align-items: center;
        justify-content: center;
        background-color: rgba(0, 0, 0, 0.45);
    }

    .modal {
        background-color: #fff;
        border-radius: 10px;
        width: 90%;
        max-width: 460px;
        box-shadow: 0 8px 30px rgba(0, 0, 0, 0.25);
        overflow: hidden;
    }

    @media (prefers-color-scheme: dark) {
        .modal {
            background-color: #2a2a2a;
        }
    }

    .modal-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 1rem 1.25rem;
        border-bottom: 1px solid #e0e0e0;
    }

    @media (prefers-color-scheme: dark) {
        .modal-header {
            border-bottom-color: #3a3a3a;
        }
    }

    .modal-header h2 {
        font-size: 1.05rem;
        font-weight: 600;
    }

    .close-btn {
        background: none;
        border: none;
        font-size: 1.4rem;
        line-height: 1;
        cursor: pointer;
        color: inherit;
        opacity: 0.5;
        transition: opacity 0.15s;
    }

    .close-btn:hover {
        opacity: 1;
    }

    .body {
        padding: 1.25rem;
        display: flex;
        flex-direction: column;
        gap: 1.25rem;
    }

    .section {
        display: flex;
        flex-direction: column;
    }

    .section-title {
        font-size: 0.8rem;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.03em;
        opacity: 0.7;
        margin: 0 0 0.5rem 0;
    }

    .info-list {
        display: flex;
        flex-direction: column;
        gap: 0.35rem;
    }

    .info-row {
        display: flex;
        align-items: baseline;
        gap: 0.75rem;
    }

    .info-label {
        font-size: 0.8rem;
        opacity: 0.6;
        min-width: 72px;
        flex-shrink: 0;
    }

    .info-value {
        font-size: 0.85rem;
    }

    .link-btn {
        background: none;
        border: none;
        padding: 0;
        margin: 0;
        font: inherit;
        font-size: 0.85rem;
        color: #5b9bd5;
        text-decoration: underline;
        cursor: pointer;
        transition: opacity 0.15s;
    }

    .link-btn:hover {
        opacity: 0.8;
    }

    .project-note {
        margin: 0.6rem 0 0;
        font-size: 0.8rem;
        opacity: 0.55;
        line-height: 1.45;
    }

    .modal-footer {
        display: flex;
        justify-content: flex-end;
        gap: 0.5rem;
        padding-top: 0.75rem;
    }

    .btn {
        padding: 0.45rem 1rem;
        font-size: 0.875rem;
        font-weight: 500;
        border-radius: 6px;
        border: none;
        cursor: pointer;
        transition:
            background-color 0.15s ease,
            opacity 0.15s ease;
    }

    .btn-cancel {
        background-color: transparent;
        color: inherit;
        opacity: 0.7;
    }

    .btn-cancel:hover {
        opacity: 1;
        background-color: rgba(128, 128, 128, 0.1);
    }
</style>
