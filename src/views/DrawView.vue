<template>
  <div class="d-flex mt-20">
    <div v-if="actions" class="vertical-menu">

      <!-- <button @click="actions.changeMode('brush')">Кисть</button>
    <button @click="actions.changeMode('clear')">Ластик</button>
    <button @click="actions.changeMode('bezier')">Кривая</button>
    <button @click="actions.changeMode('box')">Прямоугольник</button>
    <button @click="actions.clearPaper">Стереть всё</button> -->


      <a @click="actions.changeMode('brush')" :class="{ active: mode === 'brush' }">Кисть</a>
      <a @click="actions.changeMode('clear')" :class="{ active: mode === 'clear' }">Ластик</a>
      <a @click="actions.changeMode('bezier')" :class="{ active: mode === 'bezier' }">Кривая</a>
      <a @click="actions.changeMode('box')" :class="{ active: mode === 'box' }">Прямоугольник</a>
      <a @click="actions.clearPaper">Стереть всё</a>
      <div class="ml-10 mt-10"> Цвет:
        <input class="mt-10" type="color" v-model="toolColor">
      </div>

    </div>
    <canvas class="canvas" tabindex="1" ref="canvas" width="800" height="600" @mousedown="canvasHandlers.onMouseDown">
    </canvas>

  </div>
</template>
  
<script setup lang="ts">
import api from '../api/api.ts'
import { useRoute } from 'vue-router'
import { onMounted, onUnmounted, reactive, ref } from 'vue'
import wsApi from '../api/ws.js'

const { roomCode } = useRoute().params

const canvas = ref<HTMLCanvasElement | null>(null)
let ctx: CanvasRenderingContext2D
const toolColor = ref<string>('black')
let myId: number
type EventHandler = (event: MouseEvent) => void
const canvasHandlers = reactive<Record<'onMouseDown' | 'onMouseMove' | 'onMouseUp', EventHandler>>({
  onMouseDown: () => { },
  onMouseMove: () => { },
  onMouseUp: () => { }
})

const mode = ref<DrawingMode>('brush')

type DrawingFigure = (DrawingBox | DrawingBrush | DrawingBezier | ClearBrush) & { drawnBy: number }

let drawingFigure: DrawingFigure | null = null

type ImageFigure = {
  type: 'image',
  dataUrl: string,
  image: HTMLImageElement
}

const drawnFigures: (DrawingFigure | ImageFigure)[] = []

const figuresInProgress: Record<number, DrawingFigure> = {}
const maxSize = 200

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
  startPoint: [number, number],
  endPoint: [number, number],
  centerPoint: [number, number] | null,
  state: 'line' | 'curve'
}

const getCanvasPoint = (event: MouseEvent) => {
  const { x, y } = canvas.value!.getBoundingClientRect()
  return [event.clientX - x, event.clientY - y] as [number, number]
}

const calcFiguresSize = () => {
  let points = 0
  for (const fig of drawnFigures) {
    if (fig.type === 'brush' || fig.type === 'clear') {
      points += fig.points.length
    }
    else if (fig.type === 'box') {
      points += 4
    }
    else if (fig.type === 'bezier') {
      points += 3
    }
  }
  return points
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

      },
      onMouseMove: (event: MouseEvent) => {
        if (!drawingFigure) return
        const fig = drawingFigure as DrawingBrush
        fig.points.push(getCanvasPoint(event))
        redrawCanvas()
        ws.send('drawing_figure', drawingFigure)
      },
      onMouseUp: async (event: MouseEvent) => {
        if (!drawingFigure) return
        const fig = drawingFigure as DrawingBrush
        fig.points.push(getCanvasPoint(event))
        drawnFigures.push(drawingFigure)
        drawingFigure = null
        if (calcFiguresSize() > maxSize) {
          saveCanvas()
        }
        else {
          redrawCanvas()
        }

        await api.putCanvas(roomCode as string, JSON.stringify(drawnFigures))

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
        ws.send('drawing_figure', drawingFigure)
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
        if (calcFiguresSize() > maxSize) {
          saveCanvas()
        }
        else {
          redrawCanvas()
        }
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
            startPoint: getCanvasPoint(event),
            endPoint: getCanvasPoint(event),
            centerPoint: null,
            state: 'line'
          }
        }
        redrawCanvas()
      },
      onMouseMove: (event: MouseEvent) => {
        if (!drawingFigure) return
        const fig = drawingFigure as DrawingBezier
        if (fig.state === 'line') {
          fig.endPoint = getCanvasPoint(event)
        }
        else {
          fig.centerPoint = getCanvasPoint(event)
        }
        ws.send('drawing_figure', drawingFigure)

        redrawCanvas()

      },
      onMouseUp: async (event: MouseEvent) => {
        if (!drawingFigure) return
        const fig = drawingFigure as DrawingBezier
        if (fig.state === 'line') {
          fig.endPoint = getCanvasPoint(event)
          fig.centerPoint = getCanvasPoint(event)
          fig.state = 'curve'
        }
        else {
          fig.centerPoint = getCanvasPoint(event)
          drawnFigures.push(drawingFigure)
          drawingFigure = null
          if (calcFiguresSize() > maxSize) {
            saveCanvas()
          }
          else {
            redrawCanvas()
          }
          await api.putCanvas(roomCode as string, JSON.stringify(drawnFigures))
        }
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
        if (calcFiguresSize() > maxSize) {
          saveCanvas()
        }
        else {
          redrawCanvas()
        }
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

let ws: Awaited<ReturnType<typeof wsApi.connect>>

onMounted(async () => {
  if (!canvas.value) return
  ctx = canvas.value.getContext('2d') as CanvasRenderingContext2D
  if (!ctx) return

  const fig = await api.getCanvas(roomCode as string)
  drawnFigures.push(...fig.canvas)
  if (drawnFigures[0] && drawnFigures[0].type === "image") { // ecли пришла картинка
    const imageFig = drawnFigures[0]
    await new Promise<void>((resolve) => {
      imageFig.image = new Image(canvas.value!.width, canvas.value!.height)
      imageFig.image.src = imageFig.dataUrl
      imageFig.image.onload = () => resolve()
    })
  }
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
    } else if (data.type === 'saved_canvas') {

      const image = new Image(canvas.value!.width, canvas.value!.height)
      image.src = data.payload
      drawnFigures.splice(0, drawnFigures.length, {
        type: 'image',
        dataUrl: data.payload,
        image
      })
      image.onload = () => redrawCanvas()
    } else if (data.type === 'update_room') {
      const fig = data.payload.figure as DrawingFigure | ImageFigure
      if (fig.type === 'image') {
        fig.image = new Image()
        fig.image.src = fig.dataUrl
        fig.image.onload = () => redrawCanvas()
        drawnFigures.splice(0, drawnFigures.length, fig)
      } else if (fig.drawnBy !== myId) {
        if (fig.type)
          drawnFigures.push(fig)
        delete figuresInProgress[fig.drawnBy]
        redrawCanvas()
      }
    } else if (data.type === 'clear_room') {
      console.log('clear_room')
      drawnFigures.splice(0, drawnFigures.length)
      for (const key in figuresInProgress) {
        delete figuresInProgress[key]
      }
      redrawCanvas()
    }
  })
  ws.onerror((event) => {
    alert(`Ошибка установки соединения с ${event}`)
  })
  ws.onclose(() => {
    console.log(`Соединение закрыто`)
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
      await api.putCanvas(roomCode as string, '[]')
    }
  }

  actions.value.changeMode('brush')
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
  ctx.fillStyle = bez.fill
  ctx.strokeStyle = bez.stroke
  ctx.lineWidth = bez.lineWidth

  ctx.beginPath()

  if (bez.state === 'line') {
    ctx.moveTo(...bez.startPoint)
    ctx.lineTo(...bez.endPoint)
  } else {
    ctx.bezierCurveTo(...bez.startPoint, ...bez.centerPoint!, ...bez.endPoint)
  }
  ctx.stroke()
  ctx.closePath()
}
const drawBrush = (brush: DrawingBrush, ctx: CanvasRenderingContext2D) => {
  if (!brush.points) return
  ctx.fillStyle = brush.fill
  ctx.strokeStyle = brush.stroke
  ctx.lineWidth = brush.lineWidth

  const [first, ...points] = brush.points
  let [px, py] = first
  for (const [x, y] of points) {
    ctx.beginPath()
    ctx.moveTo(px, py)
    ctx.lineTo(x, y)
    ctx.stroke()
    ctx.closePath()
    px = x
    py = y
  }
  for (const [x, y] of brush.points) {
    ctx.beginPath()
    ctx.arc(x, y, brush.lineWidth / 2, 0, Math.PI * 2)
    ctx.fill()
    ctx.closePath()
  }
}
const clearBrush = (clear: ClearBrush, ctx: CanvasRenderingContext2D) => {
  if (!clear.points) return
  ctx.fillStyle = clear.fill
  ctx.strokeStyle = clear.stroke
  ctx.lineWidth = clear.lineWidth
  const [first, ...points] = clear.points
  let [px, py] = first
  for (const [x, y] of points) {
    ctx.beginPath()
    ctx.moveTo(px, py)
    ctx.lineTo(x, y)
    ctx.stroke()
    ctx.closePath()
    px = x
    py = y
  }
  for (const [x, y] of clear.points) {
    ctx.beginPath()
    ctx.arc(x, y, clear.lineWidth / 2, 0, Math.PI * 2)
    ctx.fill()
    ctx.closePath()
  }
}
const drawBackgroundImage = (image: HTMLImageElement, ctx: CanvasRenderingContext2D) => {
  ctx.drawImage(image, 0, 0)
}


const saveCanvas = () => {
  if (!canvas.value) return
  const dataUrl = canvas.value!.toDataURL()

  ws.send('saved_canvas', dataUrl)
  const image = new Image(canvas.value!.width, canvas.value!.height)
  image.src = dataUrl
  drawnFigures.splice(0, drawnFigures.length, {
    type: 'image',
    dataUrl,
    image
  })
  image.onload = () => redrawCanvas()
}

let needRedraw = false
const redrawCanvas = () => {
  if (needRedraw || !ctx) return
  needRedraw = true
  requestAnimationFrame(() => {
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
      } else if (fig.type === 'image') {
        drawBackgroundImage(fig.image, ctx)
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
    needRedraw = false
  })
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
  cursor: crosshair;
  background-color: white;
}
</style>
  