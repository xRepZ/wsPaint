import { createRouter, createWebHistory } from 'vue-router'
import HomeView from './views/HomeView.vue'
import DrawView from './views/DrawView.vue'


const routes = [
    {
        path: '/',
        component: HomeView
    },
    {
        path: '/draw/:roomCode',
        component: DrawView
    },
]

const router = createRouter({
    history: createWebHistory(),
    routes
})
console.log(routes)
export default router
