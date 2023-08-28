<template>
  <canvas class="canvas" tabindex="1" ref="canvas" width="800" height="600" @mousedown="canvasHandlers.onMouseDown">
  </canvas>
  <div v-if="actions">
    <input type="color" v-model="toolColor">
    <button @click="actions.changeMode('brush')">Кисть</button>
    <button @click="actions.changeMode('clear')">Ластик</button>
    <button @click="actions.changeMode('bezier')">Кривая</button>
    <button @click="actions.changeMode('box')">Прямоугольник</button>
    <button @click="actions.clearPaper">Стереть всё</button>
    <div>is loop? {{ loopIsRunning }} </div>
  </div>
</template>
  
<script setup lang="ts">
import api from '../api/api.ts'
import { useRoute } from 'vue-router'
import { onMounted, onUnmounted, reactive, ref } from 'vue'
import wsApi from '../api/ws.js'

const { roomCode } = useRoute().params

const canvas = ref<HTMLCanvasElement | null>(null)
const toolColor = ref<string>('black')


type EventHandler = (event: MouseEvent) => void
const canvasHandlers = reactive<Record<'onMouseDown' | 'onMouseMove' | 'onMouseUp', EventHandler>>({
  onMouseDown: () => { },
  onMouseMove: () => { },
  onMouseUp: () => { }
})

const mode = ref<DrawingMode>('brush')

const drawnFigures: Record<string, unknown>[] = []
const drawnFiguresWs: Record<string, unknown>[] = []

let drawingFigure: DrawingBox | DrawingBrush | DrawingBezier | ClearBrush | null = null

type DrawingBox = {
  type: 'box',
  stroke: string,
  fill: string,
  lineWidth: number,
  firstPoint: [number, number],
  secondPoint: [number, number] | null
}

type DrawingBrush = {
  type: 'brush',
  stroke: string,
  fill: string,
  lineWidth: number,
  points: [number, number][]
}
type ClearBrush = {
  type: 'clear',
  stroke: string,
  fill: string,
  lineWidth: number,
  points: [number, number][]
}

type DrawingBezier = {
  type: 'bezier',
  stroke: string,
  fill: string,
  lineWidth: number,
  points: [number, number][]
}

const getCanvasPoint = (event: MouseEvent) => {
  const { x, y } = canvas.value!.getBoundingClientRect()
  return [event.clientX - x, event.clientY - y] as [number, number]
}

const modes = {
  brush: () => {
    return {
      onMouseDown: (event: MouseEvent) => {

        drawingFigure = {
          type: 'brush',
          stroke: toolColor.value,
          fill: toolColor.value,
          lineWidth: 5,
          points: [getCanvasPoint(event)]
        }

      },
      onMouseMove: (event: MouseEvent) => {
        if (!drawingFigure) return
        const fig = drawingFigure as DrawingBrush
        fig.points.push(getCanvasPoint(event))
        //ws.send('update_room', { room: roomCode, figure: fig })
      },
      onMouseUp: async () => {
        if (!drawingFigure) return
        drawnFigures.push(drawingFigure)

        await api.putCanvas(roomCode as string, JSON.stringify(drawnFigures))
        drawingFigure = null

      },
    }
  },
  clear: () => {
    return {
      onMouseDown: (event: MouseEvent) => {
        drawingFigure = {
          type: 'clear',
          stroke: 'white',
          fill: 'white',
          lineWidth: 30,
          points: [getCanvasPoint(event)]
        }
      },
      onMouseMove: (event: MouseEvent) => {
        if (!drawingFigure) return
        const fig = drawingFigure as ClearBrush
        fig.points.push(getCanvasPoint(event))
      },
      onMouseUp: async () => {
        if (!drawingFigure) return
        drawnFigures.push(drawingFigure)
        await api.putCanvas(roomCode as string, JSON.stringify(drawnFigures))
        drawingFigure = null
      }
    }
  },
  bezier: () => {
    return {
      onMouseDown: (event: MouseEvent) => {
        if (!drawingFigure) {
          drawingFigure = {
            type: 'bezier',
            stroke: toolColor.value,
            fill: toolColor.value,
            lineWidth: 10,
            points: [getCanvasPoint(event)]
          }
        } else {
          const fig = drawingFigure as DrawingBezier
          console.log("fig", fig)
          if (fig.points.length !== 3) {
            fig.points.push(getCanvasPoint(event))
          } else {
            fig.points.length = 0
          }
        }


      },
      onMouseMove: () => {
        if (!drawingFigure) return

      },
      onMouseUp: async () => {
        if (!drawingFigure) return
        const fig = drawingFigure as DrawingBezier
        if (fig.points.length === 3) {
          drawnFigures.push(drawingFigure)
          await api.putCanvas(roomCode as string, JSON.stringify(drawnFigures))
          drawingFigure = null
        }
      }
    }
  },
  box: () => {
    return {
      onMouseDown: (event: MouseEvent) => {
        drawingFigure = {
          type: 'box',
          stroke: toolColor.value,
          fill: toolColor.value,
          lineWidth: 10,
          firstPoint: getCanvasPoint(event),
          secondPoint: null
        }
      },
      onMouseMove: (event: MouseEvent) => {
        if (!drawingFigure) return
        const fig = drawingFigure as DrawingBox
        fig.secondPoint = getCanvasPoint(event)
      },
      onMouseUp: async () => {
        if (!drawingFigure) return
        drawnFigures.push(drawingFigure)
        await api.putCanvas(roomCode as string, JSON.stringify(drawnFigures))
        drawingFigure = null

      }
    }
  }
}

type DrawingMode = keyof typeof modes

type Actions = {
  changeMode: (newMode: DrawingMode) => void,
  clearPaper: () => void
}

let actions = ref<Actions | null>(null)

let loopIsRunning = true
let ws: Awaited<ReturnType<typeof wsApi.connect>>

onMounted(async () => {
  if (!canvas.value) return
  const ctx = canvas.value.getContext('2d')
  if (!ctx) return
  const fig = await api.getCanvas(roomCode as string)
  drawnFiguresWs.push(...fig.canvas)
  drawnFigures.push(...fig.canvas)
  //drawnFigures.splice()


  try {
    ws = await wsApi.connect(roomCode as string)
  } catch (err: unknown) {
    // @ts-ignore
    alert(`Не удалось установить соединение с ${err.target.url}`)
    return
  }
  ws.onmessage((data: any) => {

    if (data.type === 'update_room') {

      // if (data.payload.figure.type === 'box') {
      //   drawBox(data.payload.figure as DrawingBox)
      // } else if (data.payload.figure.type === 'brush') {

      //   drawBrush(data.payload.figure)
      // } else if (data.payload.figure.type === 'bezier') {
      //   drawBezier(data.payload.figure as DrawingBezier)
      // } else if (data.payload.figure.type === 'clear') {
      //   clearBrush(data.payload.figure as ClearBrush)
      // }
      drawnFiguresWs.push(data.payload.figure)
    } else if (data.type === 'clear_room') {

      console.log('clear_room')
      //drawnFiguresWs.splice(0, data.payload.length) ?
      drawnFiguresWs.length = 0

    }
  })
  ws.onerror((event) => {
    alert(`Ошибка установки соединения с ${event}`)
  })
  ws.onclose((event) => {

  })
  //console.log(vals)
  //drawnFigures.values = JSON.parse(vals) 
  actions.value = {
    changeMode: (newMode: DrawingMode) => {
      mode.value = newMode
      document.removeEventListener('mouseup', canvasHandlers.onMouseUp)
      document.removeEventListener('mousemove', canvasHandlers.onMouseMove)
      Object.assign(canvasHandlers, modes[newMode]())
      document.addEventListener('mouseup', canvasHandlers.onMouseUp)
      document.addEventListener('mousemove', canvasHandlers.onMouseMove)
    },
    clearPaper: async () => {
      drawnFigures.splice(0, drawnFigures.length)
      await api.putCanvas(roomCode as string, JSON.stringify(drawnFigures))
    }
  }

  actions.value.changeMode('brush')

  const drawBox = (box: DrawingBox) => {
    if (!box.secondPoint) return
    ctx.fillStyle = box.fill
    ctx.strokeStyle = box.stroke
    ctx.lineWidth = box.lineWidth
    ctx.beginPath()
    ctx.rect(...box.firstPoint, box.secondPoint[0] - box.firstPoint[0], box.secondPoint[1] - box.firstPoint[1])
    ctx.fill()
    ctx.closePath()
  }
  const drawBezier = (bez: DrawingBezier) => {

    if (!bez.points) return

    if (bez.points.length !== 3) return
    ctx.fillStyle = bez.fill
    ctx.strokeStyle = bez.stroke
    ctx.lineWidth = bez.lineWidth

    ctx.beginPath()


    ctx.bezierCurveTo(bez.points[0][0], bez.points[0][1], bez.points[1][0], bez.points[1][1], bez.points[2][0], bez.points[2][1])

    ctx.stroke()
    ctx.closePath()
  }
  const drawBrush = (brush: DrawingBrush) => {
    if (!brush.points) return
    ctx.fillStyle = brush.fill
    ctx.strokeStyle = brush.stroke
    ctx.lineWidth = brush.lineWidth
    ctx.beginPath()
    const [first, ...points] = brush.points
    //console.log('brush', brush.points.length)
    ctx.moveTo(...first)
    for (const [x, y] of points) {
      ctx.lineTo(x, y)

    }
    ctx.stroke()
    ctx.closePath()
    for (const [x, y] of brush.points) {
      ctx.beginPath()
      ctx.arc(x, y, 2.5, 0, Math.PI * 2)
      ctx.fill()
      ctx.closePath()
    }
  }
  const clearBrush = (clear: ClearBrush) => {
    if (!clear.points) return
    ctx.fillStyle = clear.fill
    ctx.strokeStyle = clear.stroke
    ctx.lineWidth = clear.lineWidth
    ctx.beginPath()
    const [first, ...points] = clear.points
    ctx.moveTo(...first)
    for (const [x, y] of points) {
      ctx.lineTo(x, y)

    }
    ctx.stroke()
    ctx.closePath()
    for (const [x, y] of clear.points) {
      ctx.beginPath()
      ctx.arc(x, y, 2.5, 0, Math.PI * 2)
      ctx.fill()
      ctx.closePath()
    }
  }

  const loop = () => {
    if (!ctx) return
    ctx.clearRect(0, 0, 800, 600)
    for (const fig of drawnFiguresWs) {
      if (fig.type === 'box') {
        drawBox(fig as DrawingBox)
      } else if (fig.type === 'brush') {
        drawBrush(fig as DrawingBrush)
      } else if (fig.type === 'bezier') {
        drawBezier(fig as DrawingBezier)
      } else if (fig.type === 'clear') {
        clearBrush(fig as ClearBrush)
      }
    }
    if (drawingFigure) {
      if (drawingFigure.type === 'box') {
        drawBox(drawingFigure)
      } else if (drawingFigure.type === 'brush') {
        drawBrush(drawingFigure)
      } else if (drawingFigure.type === 'bezier') {
        drawBezier(drawingFigure)
      } else if (drawingFigure.type === 'clear') {
        clearBrush(drawingFigure)
      }
    }


    loopIsRunning && requestAnimationFrame(loop)
  }
  loop()
})

onUnmounted(() => {
  ws.close()
  loopIsRunning = false
  document.removeEventListener('mouseup', canvasHandlers.onMouseUp)
  document.removeEventListener('mousemove', canvasHandlers.onMouseMove)
})
</script>
  
<style scoped>
.canvas {
  width: 800px;
  height: 600px;
  border: 1px solid black;
  display: block;
  margin: 0 auto;
}
</style>
  