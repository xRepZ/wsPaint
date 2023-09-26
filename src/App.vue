<template>
  <div class="horizontal-menu">
    <RouterLink to='/' :class="{ active: router.currentRoute.value.path === '/'}">Home</RouterLink>
    <RouterLink :to="{ path: roomCode }" v-if="roomCode" :class="{ active: router.currentRoute.value.path === roomCode}">Room</RouterLink>
    <a v-else @click="getCode()">Create Room</a>
  </div>
  <RouterView />
</template>

<script setup lang="ts">
import { RouterLink, RouterView } from 'vue-router';
import api from './api/api.ts'
import { ref } from 'vue'
import router from './router'

const roomCode = ref('')

const getCode = async () => {
  const str = await api.createRoom()
  roomCode.value = `/draw/${str}`

}

</script>

<style>
.flex {
  display: flex;
}

.ml-10 {
  margin-left: 10px;
}
</style>