import * as Tone from 'tone'

export default class AudioRecorder
{
    constructor(_audioFeedback)
    {
        this.audio = _audioFeedback

        // Export settings
        this.exportDuration = 3000  // ms per recording
        this.isExporting = false

        this.setRecorder()
    }

    setRecorder()
    {
        // Create recorder for audio export
        this.recorder = new Tone.Recorder()
        this.audio.masterGain.connect(this.recorder)
    }

    async exportForward()
    {
        await this.recordMovement('forward', () => {
            // Simulate forward movement
            this.simulateUpdate(0, 0.04, 0.04)
        })
    }

    async exportTurnLeft()
    {
        await this.recordMovement('turn-left', () => {
            // Simulate 90-degree left turn
            this.simulateUpdate(-0.5, 0.02, 0.02)
        })
    }

    async exportTurnRight()
    {
        await this.recordMovement('turn-right', () => {
            // Simulate 90-degree right turn
            this.simulateUpdate(0.5, 0.02, 0.02)
        })
    }

    async exportStop()
    {
        await this.recordMovement('stop', () => {
            // Simulate stopped/braking state
            this.simulateUpdate(0, 0.005, 0)
        })
    }

    async recordMovement(name, updateFn)
    {
        if(this.isExporting) return
        this.isExporting = true

        // Start synth if not started
        const wasStarted = this.audio.isStarted
        if(!wasStarted)
        {
            await Tone.start()
            this.audio.synth.triggerAttack(this.audio.pitchCenter)
            this.audio.noise.start()
        }

        // Start recording
        await this.recorder.start()

        // Run simulation loop
        const startTime = Date.now()
        await new Promise(resolve =>
        {
            const interval = setInterval(() =>
            {
                const elapsed = Date.now() - startTime
                updateFn()

                if(elapsed >= this.exportDuration)
                {
                    clearInterval(interval)
                    resolve()
                }
            }, 16)
        })

        // Stop and download
        const blob = await this.recorder.stop()
        this.downloadBlob(blob, `${name}.webm`)

        // Restore state
        if(!wasStarted)
        {
            this.audio.synth.triggerRelease()
            this.audio.noise.stop()
        }
        this.isExporting = false
    }

    simulateUpdate(steering, speed, forwardSpeed)
    {
        const mapped = this.audio.getMappedValues(steering, speed, forwardSpeed)
        this.audio.panner.pan.rampTo(mapped.pan, 0.05)
        this.audio.synth.frequency.rampTo(mapped.pitch, 0.05)
        this.audio.masterGain.gain.rampTo(mapped.volume * this.audio.synthRatio, 0.05)
        this.audio.noiseGain.gain.rampTo(mapped.volume * this.audio.noiseRatio, 0.05)
        this.audio.tremolo.frequency.rampTo(mapped.lfoRate, 0.1)
        this.audio.noiseFilter.frequency.rampTo(mapped.noiseFilter, 0.1)
        this.audio.synthFilter.frequency.rampTo(mapped.synthFilter, 0.1)
    }

    downloadBlob(blob, filename)
    {
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = filename
        a.click()
        URL.revokeObjectURL(url)
    }

    createExportUI($container)
    {
        // Export section label
        const $exportLabel = document.createElement('div')
        $exportLabel.textContent = 'EXPORT'
        $exportLabel.style.color = '#888'
        $exportLabel.style.fontSize = '12px'
        $exportLabel.style.marginTop = '16px'
        $container.appendChild($exportLabel)

        // Export buttons
        const exportConfigs = [
            { name: 'forward', label: '↑ Forward' },
            { name: 'left', label: '← Left Turn' },
            { name: 'right', label: '→ Right Turn' },
            { name: 'stop', label: '⬜ Stop' }
        ]

        exportConfigs.forEach((config) =>
        {
            const $btn = document.createElement('button')
            $btn.textContent = config.label
            $btn.style.padding = '10px 20px'
            $btn.style.backgroundColor = 'rgba(0, 0, 0, 0.5)'
            $btn.style.color = '#ffffff'
            $btn.style.border = '2px solid transparent'
            $btn.style.borderRadius = '8px'
            $btn.style.cursor = 'pointer'
            $btn.style.fontSize = '14px'
            $btn.style.fontFamily = 'sans-serif'
            $btn.style.fontWeight = 'bold'
            $btn.style.letterSpacing = '1px'
            $btn.style.transition = 'opacity 0.2s ease, transform 0.2s ease, border-color 0.2s ease'
            $btn.style.opacity = '0.5'

            $btn.addEventListener('click', () =>
            {
                if(config.name === 'forward') this.exportForward()
                else if(config.name === 'left') this.exportTurnLeft()
                else if(config.name === 'right') this.exportTurnRight()
                else if(config.name === 'stop') this.exportStop()
            })

            $container.appendChild($btn)
        })
    }
}
