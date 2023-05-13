/* eslint-disable space-before-function-paren */
import { defineStore } from 'pinia'
import { TaskList, TaskData } from '../type'
import { taskData } from '../assets/data/default'

export const taskStore = defineStore('task', {
  state: () => {
    const taskList: TaskList = new Map()
    const rightTaskId = ''
    return {
      taskList,
      rightTaskId
    }
  },
  getters: {
    rightTask(state) {
      const task = state.taskList.get(state.rightTaskId)
      if (state.rightTaskId && task) {
        return task
      } else {
        return taskData
      }
    },
    taskListArray(state) {
      return Array.from(state.taskList)
    },
    failedTaskList(state) {
      const taskList: TaskData[] = []
      state.taskList.forEach(task => {
        if (task.status === 5) {
          taskList.push(task)
        }
      })
      return taskList
    }
  },
  actions: {
    setTaskList(taskList: TaskList) {
      console.log('setTaskList ===', JSON.parse(JSON.stringify(taskList)))
      this.taskList = taskList
    },
    getTask(id: string) {
      return this.taskList.get(id)
    },
    setTask(taskList: TaskData[]) {
      taskList.forEach(task => {
        console.log('setTask ===', task.id, task)
        this.taskList.set(task.id, task)
        // 修改electron-store
        const path = `taskList.${task.id}`
        window.electron.setStore(path, task)
      })
    },
    setTaskEasy(taskList: TaskData[]) {
      taskList.forEach(task => {
        console.log('===22', task.id, task.progress)
        this.taskList.set(task.id, task)
      })
    },
    deleteTask(list: string[]) {
      list.forEach(id => {
        this.taskList.delete(id)
        // 修改electron-store
        window.electron.deleteStore(`taskList.${id}`)
      })
    },
    has(id: string) {
      return this.taskList.has(id)
    },
    setRightTaskId(id: string) {
      this.rightTaskId = id
    }
  }
})
