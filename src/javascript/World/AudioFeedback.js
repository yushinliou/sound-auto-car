import * as Tone from 'tone'
import AudioRecorder from './AudioRecorder.js'

// ============================================================
// Audio Presets
// Each preset defines the full audio configuration.
// Add new versions here — they auto-appear in UI and debug.
// ============================================================
const PRESETS = {
    v1: {
        name: 'V1 – FM Synth',
        description: 'Original FM synth dominant with pink noise texture',

        synth: {
            type: 'FMSynth',
            options: {
                harmonicity: 1,
                modulationIndex: 5,
                oscillator: { type: 'sine' },
                envelope: { attack: 0.01, decay: 0.1, sustain: 1, release: 0.5 },
                modulationEnvelope: { attack: 0.01, decay: 0.1, sustain: 1, release: 0.5 }
            }
        },

        noise: {
            type: 'pink',
            filterType: 'bandpass',
            filterFreq: 500,
            filterQ: 1
        },

        tremolo: { frequency: 2, depth: 0.5, spread: 0 },
        synthFilter: { type: 'lowpass', Q: 1 },

        pitch: { min: 73, center: 110, max: 147 },
        volume: { min: 0, max: 1 },
        mix: { synthRatio: 0.5, noiseRatio: 0.3 },
        lfoRate: { min: 0.5, max: 8 },
        noiseFilter: { min: 200, max: 2000 },
        directionFilter: { min: 100, center: 400, max: 1000 },
        beepPattern: {
            enabled: false
        }
    },

    v2: {
        name: 'V2 – White Noise',
        description: 'White noise dominant with subtle sine undertone',

        synth: {
            type: 'Synth',
            options: {
                oscillator: { type: 'sine' },
                envelope: { attack: 0.5, decay: 0.1, sustain: 1, release: 1 }
            }
        },

        noise: {
            type: 'white',
            filterType: 'bandpass',
            filterFreq: 800,
            filterQ: 0.5
        },

        tremolo: { frequency: 1, depth: 0.2, spread: 0 },
        synthFilter: { type: 'lowpass', Q: 1 },

        pitch: { min: 73, center: 110, max: 147 },
        volume: { min: 0, max: 1 },
        mix: { synthRatio: 0.5, noiseRatio: 0.5 },
        lfoRate: { min: 0.3, max: 4 },
        noiseFilter: { min: 300, max: 2000 },
        directionFilter: { min: 200, center: 600, max: 3000 },
        beepPattern: {
            enabled: false
        }
    },
v3: {
    name: 'V3 – Processing',
    description: 'Alesis airSynth style data processing beeps',

    synth: {
        type: 'FMSynth',  // FM 合成更有金屬/數位感
        options: {
            harmonicity: 2,
            modulationIndex: 8,
            oscillator: { type: 'square' },
            envelope: { attack: 0.005, decay: 0.07, sustain: 0.2, release: 0.1 },
            modulationEnvelope: { attack: 0.005, decay: 0.05, sustain: 0.2, release: 0.1 }
        }
    },

    noise: {
        type: 'white',
        filterType: 'bandpass',
        filterFreq: 2000,
        filterQ: 1.5
    },

    tremolo: { frequency: 0.2, depth: 0.1, spread: 0 },
    synthFilter: { type: 'lowpass', Q: 4 },

    pitch: { min: 400, center: 800, max: 1600 },
    volume: { min: 0.15, max: 0.4 },
    mix: { synthRatio: 0.5, noiseRatio: 0.08 },
    lfoRate: { min: 2, max: 10 },
    noiseFilter: { min: 800, max: 3000 },
    directionFilter: { min: 500, center: 1200, max: 3000 },

    beepPattern: {
        enabled: true,
        rate: { min: 6, max: 15 },  // 較快的切換速度
        notes: [400, 500, 600, 800, 1000, 1200, 1400, 1600, 2000]  // 較寬的音域
    }
}
}

// Present Setting ============================================================

export default class AudioFeedback
{
    constructor(_options)
    {
        // Options
        this.debug = _options.debug
        this.time = _options.time
        this.sounds = _options.sounds

        // Set up
        this.mode = 'none' // 'none', 'congruent', 'reverse'
        this.isStarted = false
        this.isMuted = false
        this.currentPreset = 'v2'

        // Steering range: -0.534 to 0.534 radians
        this.steeringMin = -0.534
        this.steeringMax = 0.534

        // Speed range: 0 to ~0.055
        this.speedMin = 0 // allow for slight reverse speed
        this.speedMax = 0.02 // use for normalization, actual max may vary

        this.forwardSpeedMax = 0.35 // max forward speed for normalization

        // Load initial preset parameters
        this.applyPresetParams(PRESETS[this.currentPreset])

        this.setAudioChain()
        this.recorder = new AudioRecorder(this)
        this.setUI()
        this.setMuteSync()

        if(this.debug)
        {
            this.setDebug()
        }
    }

    applyPresetParams(preset)
    {
        // Pitch
        this.pitchMin = preset.pitch.min
        this.pitchCenter = preset.pitch.center
        this.pitchMax = preset.pitch.max

        // Volume
        this.volumeMin = preset.volume.min
        this.volumeMax = preset.volume.max

        // Mix ratios
        this.synthRatio = preset.mix.synthRatio
        this.noiseRatio = preset.mix.noiseRatio

        // LFO
        this.lfoRateMin = preset.lfoRate.min
        this.lfoRateMax = preset.lfoRate.max

        // Noise filter
        this.noiseFilterMin = preset.noiseFilter.min
        this.noiseFilterMax = preset.noiseFilter.max

        // Direction filter
        this.filterMin = preset.directionFilter.min
        this.filterCenter = preset.directionFilter.center
        this.filterMax = preset.directionFilter.max
    }

    setAudioChain()
    {
        const preset = PRESETS[this.currentPreset]

        // Create gain node for master volume control
        this.masterGain = new Tone.Gain(0).toDestination()

        // Create panner
        this.panner = new Tone.Panner(0).connect(this.masterGain)

        // Create tremolo (LFO) from preset
        this.tremolo = new Tone.Tremolo({
            frequency: preset.tremolo.frequency,
            depth: preset.tremolo.depth,
            spread: preset.tremolo.spread
        }).connect(this.panner).start()

        // Create filter for synth (controls forward/backward timbre)
        this.synthFilter = new Tone.Filter({
            type: preset.synthFilter.type,
            frequency: this.filterCenter,
            Q: preset.synthFilter.Q
        }).connect(this.tremolo)

        // Create synth based on preset type
        this.createSynth(preset)

        // Create noise chain for "wind" texture
        this.noiseGain = new Tone.Gain(0).connect(this.panner)

        this.noiseFilter = new Tone.Filter({
            type: preset.noise.filterType,
            frequency: preset.noise.filterFreq,
            Q: preset.noise.filterQ
        }).connect(this.noiseGain)

        this.noise = new Tone.Noise(preset.noise.type).connect(this.noiseFilter)
    }

    createSynth(preset)
    {
        // Dispose old synth if exists
        if(this.synth)
        {
            this.synth.dispose()
        }

        // Create synth based on preset type
        if(preset.synth.type === 'FMSynth')
        {
            this.synth = new Tone.FMSynth(preset.synth.options).connect(this.synthFilter)
        }
        else if(preset.synth.type === 'Synth')
        {
            this.synth = new Tone.Synth(preset.synth.options).connect(this.synthFilter)
        }
        else if(preset.synth.type === 'AMSynth')
        {
            this.synth = new Tone.AMSynth(preset.synth.options).connect(this.synthFilter)
        }
        else
        {
            // Default to basic Synth
            this.synth = new Tone.Synth(preset.synth.options).connect(this.synthFilter)
        }
    }

    // Beep ===========================================================================

    // 在 setAudioChain() 或 start() 裡啟動
    startBeepPattern() {
        const preset = PRESETS[this.currentPreset]
        if (!preset.beepPattern?.enabled) return

        // 清除舊的
        if (this.beepInterval) clearInterval(this.beepInterval)

        const scheduleNextBeep = () => {
            const { rate, notes } = preset.beepPattern
            const interval = 1000 / (rate.min + Math.random() * (rate.max - rate.min))

            this.beepTimeout = setTimeout(() => {
                if (!this.isStarted || this.mode === 'none') {
                    scheduleNextBeep()
                    return
                }

                if (this.currentSpeed < 0.00001) {
                scheduleNextBeep()
                return
                }

                // 隨機選一個音高
                const randomNote = notes[Math.floor(Math.random() * notes.length)]
                this.synth.frequency.rampTo(randomNote, 0.02)

                scheduleNextBeep()
            }, interval)
        }

        

        scheduleNextBeep()
    }

    updateBeepRate(speed) {
        const preset = PRESETS[this.currentPreset]
        if (!preset.beepPattern?.enabled) return

        const speedNormalized = this.clamp(speed / this.speedMax, 0, 1)
        const { rate } = preset.beepPattern

        // 速度越快，beep 越頻繁
        this.currentBeepRate = rate.min + speedNormalized * (rate.max - rate.min)
        this.currentSpeed = speed
    }

    stopBeepPattern() {
        if (this.beepTimeout) {
            clearTimeout(this.beepTimeout)
            this.beepTimeout = null
        }
    }

    // Beep ===========================================================================

    setPreset(presetKey)
    {
        if(!PRESETS[presetKey] || presetKey === this.currentPreset)
        {
            return
        }

        const wasStarted = this.isStarted
        const preset = PRESETS[presetKey]

        // Stop current audio
        if(wasStarted)
        {
            this.synth.triggerRelease()
            this.noise.stop()
            this.stopBeepPattern()
        }

        // Dispose old audio nodes
        this.synth.dispose()
        this.noise.dispose()
        this.noiseFilter.dispose()
        this.tremolo.dispose()
        this.synthFilter.dispose()

        // Update preset
        this.currentPreset = presetKey
        this.applyPresetParams(preset)

        // Rebuild tremolo
        this.tremolo = new Tone.Tremolo({
            frequency: preset.tremolo.frequency,
            depth: preset.tremolo.depth,
            spread: preset.tremolo.spread
        }).connect(this.panner).start()

        // Rebuild synth filter
        this.synthFilter = new Tone.Filter({
            type: preset.synthFilter.type,
            frequency: this.filterCenter,
            Q: preset.synthFilter.Q
        }).connect(this.tremolo)

        // Rebuild synth
        this.createSynth(preset)

        // Rebuild noise chain
        this.noiseFilter = new Tone.Filter({
            type: preset.noise.filterType,
            frequency: preset.noise.filterFreq,
            Q: preset.noise.filterQ
        }).connect(this.noiseGain)

        this.noise = new Tone.Noise(preset.noise.type).connect(this.noiseFilter)

        // Restart if was playing
        if(wasStarted)
        {
            this.synth.triggerAttack(this.pitchCenter)
            this.noise.start()
                if (preset.beepPattern?.enabled) {
                    this.startBeepPattern()
                }
        }

        // Update UI
        this.updatePresetUI()

        // Reconnect recorder if exists
        if(this.recorder && this.recorder.recorder)
        {
            this.masterGain.connect(this.recorder.recorder)
        }
    }

    updatePresetUI()
    {
        if(!this.ui || !this.ui.presetButtons) return

        this.ui.presetButtons.forEach((btn) =>
        {
            if(btn.preset === this.currentPreset)
            {
                btn.$element.style.opacity = '1'
                btn.$element.style.border = '2px solid #ffffff'
            }
            else
            {
                btn.$element.style.opacity = '0.5'
                btn.$element.style.border = '2px solid transparent'
            }
        })
    }

    start()
    {
        if(this.isStarted)
        {
            return
        }

        // Start Tone.js audio context after user interaction
        Tone.start().then(() =>
        {
            this.isStarted = true

            // Start the synth with a sustained note
            this.synth.triggerAttack(this.pitchCenter)

            // Start the noise
            this.noise.start()

            // Start beep pattern if enabled
            if (PRESETS[this.currentPreset].beepPattern?.enabled) {
                this.startBeepPattern()
            }
            

            // Show UI
            if(this.ui && this.ui.$container)
            {
                this.ui.$container.classList.add('is-visible')
            }
        })
    }

    stop()
    {
        if(!this.isStarted)
        {
            return
        }

        this.synth.triggerRelease()
        this.noise.stop()
        this.isStarted = false
        this.stopBeepPattern()
    }

    // setting sound according to car state
    update(steering, speed, forwardSpeed)
    {
        console.log('AudioFeedback:', { steering, speed, forwardSpeed })
        if(!this.isStarted || this.mode === 'none')
        {
            // Mute when in 'none' mode
            this.masterGain.gain.rampTo(0, 0.1)
            this.noiseGain.gain.rampTo(0, 0.1)
            return
        }

        // Get mapped values based on mode
        const mapped = this.getMappedValues(steering, speed, forwardSpeed)

        // Apply pan
        this.panner.pan.rampTo(mapped.pan, 0.05)

        // Apply pitch
        this.synth.frequency.rampTo(mapped.pitch, 0.05)

        // Apply volume
        this.masterGain.gain.rampTo(mapped.volume * this.synthRatio, 0.05)  // Synth volume
        this.noiseGain.gain.rampTo(mapped.volume * this.noiseRatio, 0.05)   // Noise volume

        // Apply LFO rate
        this.tremolo.frequency.rampTo(mapped.lfoRate, 0.1)

        // Apply noise filter frequency
        this.noiseFilter.frequency.rampTo(mapped.noiseFilter, 0.1)

        // Apply synth filter based on direction
        this.synthFilter.frequency.rampTo(mapped.synthFilter, 0.1)

        // Update beep pattern rate if enabled
        if (PRESETS[this.currentPreset].beepPattern?.enabled) {
            this.updateBeepRate(speed)
        }
    }

    getMappedValues(steering, speed, forwardSpeed)
    {
        // Normalize steering to -1 to 1 range
        const steeringNormalized = this.clamp(
            (steering - this.steeringMin) / (this.steeringMax - this.steeringMin) * 2 - 1,
            -1,
            1
        )

        // Normalize speed to 0 to 1 range
        const speedNormalized = this.clamp(
            speed / this.speedMax,
            0,
            1
        )

        let pan, pitch

        if(this.mode === 'congruent')
        {
            // Left steering -> left pan + lower pitch
            // Right steering -> right pan + higher pitch
            pan = steeringNormalized

            if(steeringNormalized < 0)
            {
                // Steering left: pitch goes from center to min
                pitch = this.pitchCenter + steeringNormalized * (this.pitchCenter - this.pitchMin)
            }
            else
            {
                // Steering right: pitch goes from center to max
                pitch = this.pitchCenter + steeringNormalized * (this.pitchMax - this.pitchCenter)
            }
        }
        else if(this.mode === 'reverse')
        {
            // Left steering -> right pan + higher pitch
            // Right steering -> left pan + lower pitch
            pan = -steeringNormalized

            if(steeringNormalized < 0)
            {
                // Steering left: pitch goes from center to max (reversed)
                pitch = this.pitchCenter - steeringNormalized * (this.pitchMax - this.pitchCenter)
            }
            else
            {
                // Steering right: pitch goes from center to min (reversed)
                pitch = this.pitchCenter - steeringNormalized * (this.pitchCenter - this.pitchMin)
            }
        }
        else
        {
            pan = 0
            pitch = this.pitchCenter
        }

        // Speed-based parameters
        const volume = this.volumeMin + speedNormalized * (this.volumeMax - this.volumeMin)
        const lfoRate = this.lfoRateMin + speedNormalized * (this.lfoRateMax - this.lfoRateMin)
        const noiseFilter = this.noiseFilterMin + speedNormalized * (this.noiseFilterMax - this.noiseFilterMin)

        // Direction-based filter 
        let synthFilter
        if(forwardSpeed < 0)
        {
            
            // Going backward: interpolate from center to min
            const backwardNormalized = this.clamp(-forwardSpeed / this.forwardSpeedMax, 0, 1)
            synthFilter = this.filterCenter - backwardNormalized * (this.filterCenter - this.filterMin)
        }
        else
        {
            // Going forward: interpolate from center to max
            const forwardNormalized = this.clamp(forwardSpeed / this.forwardSpeedMax, 0, 1)
            synthFilter = this.filterCenter + forwardNormalized * (this.filterMax - this.filterCenter)
        }

        return {
            pan,
            pitch,
            volume,
            lfoRate,
            noiseFilter,
            synthFilter
        }
    }

    setMode(mode)
    {
        this.mode = mode

        // Update UI buttons
        if(this.ui)
        {
            this.ui.buttons.forEach((btn) =>
            {
                if(btn.mode === mode)
                {
                    btn.$element.style.opacity = '1'
                    btn.$element.style.border = '2px solid #ffffff'
                }
                else
                {
                    btn.$element.style.opacity = '0.5'
                    btn.$element.style.border = '2px solid transparent'
                }
            })
        }
    }

    setUI()
    {
        this.ui = {}
        this.ui.buttons = []

        // Container
        this.ui.$container = document.createElement('div')
        this.ui.$container.className = 'audio-feedback-toggle'
        this.ui.$container.style.position = 'fixed'
        this.ui.$container.style.top = '20px'
        this.ui.$container.style.left = '20px'
        this.ui.$container.style.display = 'flex'
        this.ui.$container.style.flexDirection = 'column'
        this.ui.$container.style.gap = '8px'
        this.ui.$container.style.zIndex = '1000'
        this.ui.$container.style.userSelect = 'none'
        document.body.appendChild(this.ui.$container)

        // Button configurations
        const buttonConfigs = [
            { mode: 'none', label: 'OFF' },
            { mode: 'congruent', label: 'NORMAL' },
            { mode: 'reverse', label: 'REVERSE' }
        ]

        buttonConfigs.forEach((config) =>
        {
            const $button = document.createElement('button')
            $button.textContent = config.label
            $button.style.padding = '10px 20px'
            $button.style.backgroundColor = 'rgba(0, 0, 0, 0.5)'
            $button.style.color = '#ffffff'
            $button.style.border = '2px solid transparent'
            $button.style.borderRadius = '8px'
            $button.style.cursor = 'pointer'
            $button.style.fontSize = '14px'
            $button.style.fontFamily = 'sans-serif'
            $button.style.fontWeight = 'bold'
            $button.style.letterSpacing = '1px'
            $button.style.transition = 'opacity 0.2s ease, transform 0.2s ease, border-color 0.2s ease'
            $button.style.opacity = config.mode === 'none' ? '1' : '0.5'

            if(config.mode === 'none')
            {
                $button.style.border = '2px solid #ffffff'
            }

            $button.addEventListener('click', () =>
            {
                this.setMode(config.mode)
            })

            this.ui.$container.appendChild($button)
            this.ui.buttons.push({
                mode: config.mode,
                $element: $button
            })
        })

        // Preset section label
        const $presetLabel = document.createElement('div')
        $presetLabel.textContent = 'PRESET'
        $presetLabel.style.color = '#888'
        $presetLabel.style.fontSize = '12px'
        $presetLabel.style.marginTop = '16px'
        this.ui.$container.appendChild($presetLabel)

        // Preset buttons (auto-generated from PRESETS)
        this.ui.presetButtons = []
        Object.keys(PRESETS).forEach((presetKey) =>
        {
            const preset = PRESETS[presetKey]
            const $btn = document.createElement('button')
            $btn.textContent = preset.name
            $btn.title = preset.description
            $btn.style.padding = '10px 20px'
            $btn.style.backgroundColor = 'rgba(0, 0, 0, 0.5)'
            $btn.style.color = '#ffffff'
            $btn.style.border = presetKey === this.currentPreset ? '2px solid #ffffff' : '2px solid transparent'
            $btn.style.borderRadius = '8px'
            $btn.style.cursor = 'pointer'
            $btn.style.fontSize = '14px'
            $btn.style.fontFamily = 'sans-serif'
            $btn.style.fontWeight = 'bold'
            $btn.style.letterSpacing = '1px'
            $btn.style.transition = 'opacity 0.2s ease, transform 0.2s ease, border-color 0.2s ease'
            $btn.style.opacity = presetKey === this.currentPreset ? '1' : '0.5'

            $btn.addEventListener('click', () =>
            {
                this.setPreset(presetKey)
            })

            this.ui.$container.appendChild($btn)
            this.ui.presetButtons.push({
                preset: presetKey,
                $element: $btn
            })
        })

        // Add export UI from recorder
        this.recorder.createExportUI(this.ui.$container)
    }

    setMuteSync()
    {
        // Listen for M key to sync with Howler mute
        window.addEventListener('keydown', (_event) =>
        {
            if(_event.key === 'm')
            {
                this.isMuted = !this.isMuted

                if(this.isMuted)
                {
                    this.masterGain.gain.rampTo(0, 0.1)
                    this.noiseGain.gain.rampTo(0, 0.1)
                }
            }
        })

        // Sync with tab visibility
        document.addEventListener('visibilitychange', () =>
        {
            if(document.hidden)
            {
                this.masterGain.gain.rampTo(0, 0.1)
                this.noiseGain.gain.rampTo(0, 0.1)
            }
        })

        // Sync mute state with Sounds class if available
        if(this.sounds)
        {
            this.isMuted = this.sounds.muted
        }
    }

    setDebug()
    {
        this.debugFolder = this.debug.addFolder('audioFeedback')

        // Mode control
        const debugParams = {
            mode: this.mode,
            preset: this.currentPreset
        }

        this.debugFolder.add(debugParams, 'mode', ['none', 'congruent', 'reverse']).onChange((value) =>
        {
            this.setMode(value)
        })

        // Preset control (auto-generated from PRESETS keys)
        this.debugFolder.add(debugParams, 'preset', Object.keys(PRESETS)).onChange((value) =>
        {
            this.setPreset(value)
        })

        // Mix ratios
        const mixFolder = this.debugFolder.addFolder('mix')
        mixFolder.add(this, 'synthRatio').min(0).max(1).step(0.01).name('synthRatio')
        mixFolder.add(this, 'noiseRatio').min(0).max(1).step(0.01).name('noiseRatio')

        // Pitch parameters
        const pitchFolder = this.debugFolder.addFolder('pitch')
        pitchFolder.add(this, 'pitchMin').min(50).max(500).step(1).name('min (Hz)')
        pitchFolder.add(this, 'pitchCenter').min(100).max(500).step(1).name('center (Hz)')
        pitchFolder.add(this, 'pitchMax').min(100).max(800).step(1).name('max (Hz)')

        // Volume parameters
        const volumeFolder = this.debugFolder.addFolder('volume')
        volumeFolder.add(this, 'volumeMin').min(0).max(1).step(0.01).name('min')
        volumeFolder.add(this, 'volumeMax').min(0).max(1).step(0.01).name('max')

        // LFO/Tremolo parameters
        const lfoFolder = this.debugFolder.addFolder('lfo')
        lfoFolder.add(this, 'lfoRateMin').min(0.1).max(5).step(0.1).name('rateMin (Hz)')
        lfoFolder.add(this, 'lfoRateMax').min(1).max(20).step(0.1).name('rateMax (Hz)')

        // Noise filter parameters
        const noiseFolder = this.debugFolder.addFolder('noiseFilter')
        noiseFolder.add(this, 'noiseFilterMin').min(50).max(1000).step(10).name('min (Hz)')
        noiseFolder.add(this, 'noiseFilterMax').min(500).max(5000).step(10).name('max (Hz)')

        // Synth filter parameters (forward/backward)
        const synthFilterFolder = this.debugFolder.addFolder('synthFilter')
        synthFilterFolder.add(this, 'filterMin').min(50).max(500).step(10).name('backward (Hz)')
        synthFilterFolder.add(this, 'filterCenter').min(200).max(1500).step(10).name('center (Hz)')
        synthFilterFolder.add(this, 'filterMax').min(500).max(5000).step(10).name('forward (Hz)')

        // Speed range
        const speedFolder = this.debugFolder.addFolder('speedRange')
        speedFolder.add(this, 'speedMax').min(0.01).max(0.2).step(0.005).name('speedMax')
    }

    clamp(value, min, max)
    {
        return Math.min(Math.max(value, min), max)
    }
}
