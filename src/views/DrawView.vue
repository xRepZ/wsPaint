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
let myId: number

type EventHandler = (event: MouseEvent) => void
const canvasHandlers = reactive<Record<'onMouseDown' | 'onMouseMove' | 'onMouseUp', EventHandler>>({
  onMouseDown: () => { },
  onMouseMove: () => { },
  onMouseUp: () => { }
})

const mode = ref<DrawingMode>('brush')

const drawnFigures: Record<string, unknown>[] = []

type DrawingFigure = (DrawingBox | DrawingBrush | DrawingBezier | ClearBrush) & { drawnBy: number }

let drawingFigure: DrawingFigure | null = null

const figuresInProgress: Record<number, DrawingFigure> = {}

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
  points: [number, number][],
  click: number
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
          drawnBy: myId,
          type: 'brush',
          stroke: toolColor.value,
          fill: toolColor.value,
          lineWidth: 5,
          points: [getCanvasPoint(event)]
        }
        redrawCanvas()
        ws.send('drawing_figure', drawingFigure)
        //redrawCanvas(canvas.value!.getContext('2d') as CanvasRenderingContext2D)
      },
      onMouseMove: (event: MouseEvent) => {
        if (!drawingFigure) return
        const fig = drawingFigure as DrawingBrush
        fig.points.push(getCanvasPoint(event))
        redrawCanvas()
        ws.send('drawing_figure', drawingFigure)

        //ws.send('update_room', { room: roomCode, figure: fig })
      },
      onMouseUp: async (event: MouseEvent) => {
        if (!drawingFigure) return
        const fig = drawingFigure as DrawingBrush
        fig.points.push(getCanvasPoint(event))
        drawnFigures.push(drawingFigure)
        drawingFigure = null
        redrawCanvas()
        await api.putCanvas(roomCode as string, JSON.stringify(drawnFigures))
        //redrawCanvas(canvas.value!.getContext('2d') as CanvasRenderingContext2D)
      },
    }
  },
  clear: () => {
    return {
      onMouseDown: (event: MouseEvent) => {
        drawingFigure = {
          drawnBy: myId,
          type: 'clear',
          stroke: 'white',
          fill: 'white',
          lineWidth: 30,
          points: [getCanvasPoint(event)]
        }
        redrawCanvas()
        ws.send('drawing_figure', drawingFigure) // check
      },
      onMouseMove: (event: MouseEvent) => {
        if (!drawingFigure) return
        const fig = drawingFigure as ClearBrush
        fig.points.push(getCanvasPoint(event))
        redrawCanvas()
        ws.send('drawing_figure', drawingFigure)
      },
      onMouseUp: async () => {
        if (!drawingFigure) return
        drawnFigures.push(drawingFigure)
        drawingFigure = null
        redrawCanvas()
        await api.putCanvas(roomCode as string, JSON.stringify(drawnFigures))
      }
    }
  },
  bezier: () => {
    return {
      onMouseDown: (event: MouseEvent) => {
        if (!drawingFigure) {
          drawingFigure = {
            drawnBy: myId,
            type: 'bezier',
            stroke: toolColor.value,
            fill: toolColor.value,
            lineWidth: 10,
            points: [getCanvasPoint(event)],
            click: 1
          }
        } else {
          const fig = drawingFigure as DrawingBezier
          console.log("fig", fig)
          fig.click++
          //fig.points.push(getCanvasPoint(event))
          // if (fig.points.length !== 3) {
          //   fig.points.push(getCanvasPoint(event))
          // } else {
          //   fig.points.length = 0
          // }
        }
        redrawCanvas()

      },
      onMouseMove: (event: MouseEvent) => {
        if (!drawingFigure) return
        //console.log("move")
        const fig = drawingFigure as DrawingBezier
        fig.points.splice(fig.click, 1, getCanvasPoint(event))
        // if (fig.click === 1) {
        //   fig.points.splice(1, 1, getCanvasPoint(event))
        //   console.log(fig.points[1])
        // } else {
        //   fig.points.splice(2, 1, getCanvasPoint(event))
        //   console.log(fig.points[2])
        // }
        ws.send('drawing_figure', drawingFigure)

        redrawCanvas()

      },
      onMouseUp: async () => {
        if (!drawingFigure) return
        const fig = drawingFigure as DrawingBezier
        if (fig.click === 3) {
          console.log("push", fig.points.length)
          drawnFigures.push(drawingFigure)
          drawingFigure = null
          await api.putCanvas(roomCode as string, JSON.stringify(drawnFigures))
        }
        redrawCanvas()
      }
    }
  },
  box: () => {
    return {
      onMouseDown: (event: MouseEvent) => {
        drawingFigure = {
          drawnBy: myId,
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
        redrawCanvas()
        ws.send('drawing_figure', drawingFigure)

      },
      onMouseUp: async () => {
        if (!drawingFigure) return
        drawnFigures.push(drawingFigure)
        drawingFigure = null
        redrawCanvas()
        await api.putCanvas(roomCode as string, JSON.stringify(drawnFigures))
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

//let loopIsRunning = true
let ws: Awaited<ReturnType<typeof wsApi.connect>>

onMounted(async () => {
  if (!canvas.value) return
  const ctx = canvas.value.getContext('2d')
  if (!ctx) return
  const fig = await api.getCanvas(roomCode as string)
  drawnFigures.push(...fig.canvas)


  try {
    ws = await wsApi.connect(roomCode as string)
  } catch (err: unknown) {
    // @ts-ignore
    alert(`Не удалось установить соединение с ${err.target.url}`)
    return
  }
  ws.onmessage((data: any) => {
    if (data.type === 'connected') {
      myId = data.payload
    } else if (data.type === 'drawing_figure') {
      const fig = data.payload as DrawingFigure
      figuresInProgress[fig.drawnBy] = fig
      redrawCanvas()
    } else if (data.type === 'update_room') {
      const fig = data.payload.figure
      if (fig.drawnBy !== myId) {
        drawnFigures.push(fig)
        delete figuresInProgress[fig.drawnBy]
      }
      redrawCanvas()
    } else if (data.type === 'clear_room') {
      console.log('clear_room')
      drawnFigures.splice(0, drawnFigures.length)
      redrawCanvas()
    }
  })
  ws.onerror((event) => {
    alert(`Ошибка установки соединения с ${event}`)
  })
  ws.onclose((event) => {
    alert(`Ошибка ${event}`)
  })

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
      redrawCanvas()
      await api.putCanvas(roomCode as string, JSON.stringify(drawnFigures))
    }
  }

  actions.value.changeMode('brush')

 


  // const loop = () => {
  //   redrawCanvas()
  //   loopIsRunning && requestAnimationFrame(loop)
  // }
  // loop()
  redrawCanvas()
})



const drawBox = (box: DrawingBox, ctx: CanvasRenderingContext2D) => {
  if (!box.secondPoint) return
  ctx.fillStyle = box.fill
  ctx.strokeStyle = box.stroke
  ctx.lineWidth = box.lineWidth
  ctx.beginPath()
  ctx.rect(...box.firstPoint, box.secondPoint[0] - box.firstPoint[0], box.secondPoint[1] - box.firstPoint[1])
  ctx.fill()
  ctx.closePath()
}
const drawBezier = (bez: DrawingBezier, ctx: CanvasRenderingContext2D) => {

  if (!bez.points) return
  const len = bez.points.length
  //if (bez.points.length !== 2) return
  ctx.fillStyle = bez.fill
  ctx.strokeStyle = bez.stroke
  ctx.lineWidth = bez.lineWidth

  ctx.beginPath()

  // ctx.bezierCurveTo(bez.points[0][0], bez.points[0][1], bez.points[1][0], bez.points[1][1], bez.points[2][0], bez.points[2][1])
  if (len === 3) {
    ctx.bezierCurveTo(bez.points[0][0], bez.points[0][1], bez.points[1][0], bez.points[1][1], bez.points[2][0], bez.points[2][1])
  } else if (len === 2) {
    ctx.bezierCurveTo(bez.points[0][0], bez.points[0][1], bez.points[1][0], bez.points[1][1], bez.points[1][0], bez.points[1][1])
  }



  ctx.stroke()
  ctx.closePath()
}
const drawBrush = (brush: DrawingBrush, ctx: CanvasRenderingContext2D) => {
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
const clearBrush = (clear: ClearBrush, ctx: CanvasRenderingContext2D) => {
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



const redrawCanvas = () => {
  const ctx = canvas.value?.getContext('2d')
  if (!ctx) return
  ctx.clearRect(0, 0, 800, 600)
  for (const fig of drawnFigures) {
    if (fig.type === 'box') {
      drawBox(fig as DrawingBox, ctx)
    } else if (fig.type === 'brush') {
      drawBrush(fig as DrawingBrush, ctx)
    } else if (fig.type === 'bezier') {
      drawBezier(fig as DrawingBezier, ctx)
    } else if (fig.type === 'clear') {
      clearBrush(fig as ClearBrush, ctx)
    }
  }
  for (const fig of Object.values(figuresInProgress)) {
    if (fig.type === 'box') {
      drawBox(fig, ctx)
    } else if (fig.type === 'brush') {
      drawBrush(fig, ctx)
    } else if (fig.type === 'bezier') {
      drawBezier(fig, ctx)
    } else if (fig.type === 'clear') {
      clearBrush(fig, ctx)
    }
  }
  if (drawingFigure) {
    if (drawingFigure.type === 'box') {
      drawBox(drawingFigure, ctx)
    } else if (drawingFigure.type === 'brush') {
      drawBrush(drawingFigure, ctx)
    } else if (drawingFigure.type === 'bezier') {
      drawBezier(drawingFigure, ctx)
    } else if (drawingFigure.type === 'clear') {
      clearBrush(drawingFigure, ctx)
    }
  }
}




onUnmounted(() => {
  ws.close()
  //loopIsRunning = false
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
  