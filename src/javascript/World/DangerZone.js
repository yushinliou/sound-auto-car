import * as THREE from 'three'
import { Howl } from 'howler'

export default class DangerZone
{
    constructor(_options)
    {
        this.time = _options.time
        this.car = _options.car
        this.position = _options.position || { x: 20, y: 0 }
        this.radius = _options.radius || 8
        this.musicKey = _options.musicKey || 'dangerous-dumb'

        this.container = new THREE.Object3D()
        this.isPlaying = false

        this.setVisual()
        this.setLabel()
        this.setAudio(this.musicKey)
        this.setProximityDetection()
    }

    setVisual()
    {
        const geometry = new THREE.CircleGeometry(this.radius, 64)

        const material = new THREE.ShaderMaterial({
            transparent: true,
            depthWrite: false,
            vertexShader: `
                varying vec2 vUv;
                void main() {
                    vUv = uv;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                varying vec2 vUv;
                void main() {
                    float dist = distance(vUv, vec2(0.5)) * 2.0;
                    float alpha = smoothstep(1.0, 0.2, dist) * 0.65;
                    gl_FragColor = vec4(1.0, 0.0, 0.0, alpha);
                }
            `
        })

        this.circle = new THREE.Mesh(geometry, material)
        this.circle.position.set(this.position.x, this.position.y, 0.001)
        this.container.add(this.circle)
    }

    setLabel()
    {
        const canvas = document.createElement('canvas')
        canvas.width = 512
        canvas.height = 128
        const ctx = canvas.getContext('2d')

        ctx.clearRect(0, 0, canvas.width, canvas.height)
        ctx.fillStyle = 'rgba(0, 0, 0, 0)'
        ctx.fillRect(0, 0, canvas.width, canvas.height)

        ctx.fillStyle = '#ffffff'
        ctx.font = 'bold 52px sans-serif'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText('⚠ DANGER AREA', canvas.width / 2, canvas.height / 2)

        const texture = new THREE.CanvasTexture(canvas)

        const geometry = new THREE.PlaneGeometry(this.radius * 1.2, this.radius * 0.25)
        const material = new THREE.MeshBasicMaterial({
            transparent: true,
            depthWrite: false,
            color: 0xffffff,
            alphaMap: texture
        })

        this.label = new THREE.Mesh(geometry, material)
        this.label.position.set(this.position.x, this.position.y, 0.002)
        this.container.add(this.label)
    }

    setAudio(musicKey)
    {
        this.sound = new Howl({
            src: [`./sounds/danger-zone/${musicKey}.wav`],
            loop: true,
            volume: 0
        })
    }

    setProximityDetection()
    {
        this.time.on('tick', () =>
        {
            if(!this.car) return

            const dx = this.car.position.x - this.position.x
            const dy = this.car.position.y - this.position.y
            const distance = Math.sqrt(dx * dx + dy * dy)

            if(distance < this.radius)
            {
                const proximity = 1 - distance / this.radius
                const volume = proximity * proximity

                if(!this.isPlaying)
                {
                    this.sound.play()
                    this.isPlaying = true
                }

                this.sound.volume(volume)
            }
            else
            {
                if(this.isPlaying)
                {
                    this.sound.volume(0)
                    this.sound.stop()
                    this.isPlaying = false
                }
            }
        })
    }
}
