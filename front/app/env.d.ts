declare namespace NodeJS {
  interface ProcessEnv {
    VISION_API_URL: string
    VISION_API_KEY: string
    LLM_API_KEY: string
    LLM_API_URL: string
    STORAGE_API_URL: string
    STORAGE_API_KEY: string
  }
}
