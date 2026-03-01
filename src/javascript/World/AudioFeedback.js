import * as Tone from 'tone'

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

        // Steering range: -0.534 to 0.534 radians
        this.steeringMin = -0.534
        this.steeringMax = 0.534

        // Speed range: 0 to ~0.055
        this.speedMin = 0 // allow for slight reverse speed
        this.speedMax = 0.02 // use for normalization, actual max may vary

        this.forwardSpeedMax = 0.35 // max forward speed for normalization

        // Audio parameter ranges
        this.pitchMin = 73 //147  // Hz (left/low)
        this.pitchCenter = 110 // 220  // Hz (center)
        this.pitchMax = 147 // 293  // Hz (right/high)

        this.volumeMin = 0
        this.volumeMax = 1

        this.lfoRateMin = 0.5  // Hz
        this.lfoRateMax = 8    // Hz

        this.noiseFilterMin = 200   // Hz
        this.noiseFilterMax = 2000  // Hz

        // 200, 800, 2000 -> to 100, 400, 1000 
        this.filterMin = 100    // Hz (backward, dark)
        this.filterCenter = 400 // Hz (center, when car is still)
        this.filterMax = 1000   // Hz (forward, bright)

        this.setAudioChain()
        this.setUI()
        this.setMuteSync()

        if(this.debug)
        {
            this.setDebug()
        }
    }

    setAudioChain()
    {
        // Create gain node for master volume control
        this.masterGain = new Tone.Gain(0).toDestination()

        // Create panner
        this.panner = new Tone.Panner(0).connect(this.masterGain)

        // Create tremolo (LFO)
        this.tremolo = new Tone.Tremolo({
            frequency: 2,
            depth: 0.5,
            spread: 0
        }).connect(this.panner).start()

        // Create filter for synth (controls forward/backward timbre)
        this.synthFilter = new Tone.Filter({
            type: 'lowpass',
            frequency: this.filterCenter,
            Q: 1
        }).connect(this.tremolo)

        // Create FM Synth with sawtooth wave
        this.synth = new Tone.FMSynth({
            harmonicity: 1, //3,
            modulationIndex: 5, //10,
            oscillator: {
                type: 'sine' // 'sawtooth'
            },
            envelope: {
                attack: 0.01,
                decay: 0.1,
                sustain: 1,
                release: 0.5
            },
            modulationEnvelope: {
                attack: 0.01,
                decay: 0.1,
                sustain: 1,
                release: 0.5
            }
        }).connect(this.synthFilter)

        // Create noise chain for "wind" texture
        this.noiseGain = new Tone.Gain(0).connect(this.panner)

        this.noiseFilter = new Tone.Filter({
            type: 'bandpass',
            frequency: 500,
            Q: 1
        }).connect(this.noiseGain)

        this.noise = new Tone.Noise('pink').connect(this.noiseFilter)
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
    }

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
        this.masterGain.gain.rampTo(mapped.volume * 0.5, 0.05)  // Synth volume
        this.noiseGain.gain.rampTo(mapped.volume * 0.3, 0.05)   // Noise volume (quieter)

        // Apply LFO rate
        this.tremolo.frequency.rampTo(mapped.lfoRate, 0.1)

        // Apply noise filter frequency
        this.noiseFilter.frequency.rampTo(mapped.noiseFilter, 0.1)

        // Apply synth filter based on direction
        this.synthFilter.frequency.rampTo(mapped.synthFilter, 0.1)
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
            mode: this.mode
        }

        this.debugFolder.add(debugParams, 'mode', ['none', 'congruent', 'reverse']).onChange((value) =>
        {
            this.setMode(value)
        })

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
