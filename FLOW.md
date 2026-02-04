# 📸 DeepSentinel Service Flow

Visual demonstration of the complete service workflow and AI-powered video analysis pipeline.

## 1. Service Landing & Upload

|                    Main Dashboard                     |                 Video Upload                 |
| :---------------------------------------------------: | :------------------------------------------: |
| ![Main](docs/assets/page_screenshots/main%20page.png) | ![Upload](docs/assets/flow/upload_video.png) |
|     **Real-time performance metrics monitoring**      |         **Start CCTV video upload**          |

## 2. Video Analysis Setup

|                      File Selection                       |                Analysis Start                |
| :-------------------------------------------------------: | :------------------------------------------: |
| ![Setup](docs/assets/flow/set_file_and_date_of_video.png) | ![Start](docs/assets/flow/start_analyze.png) |
|        **Configure video file and analysis date**         |      **Trigger AWS Batch analysis job**      |

## 3. Backend Pipeline (Serverless)

|               SQS → Batch Trigger                |                         Analysis Progress                         |
| :----------------------------------------------: | :---------------------------------------------------------------: |
| ![Lambda](docs/assets/flow/sqs_to_batch_log.png) | ![Progress](docs/assets/flow/can_check_progress_of_analyzing.png) |
|  **Lambda transforms SQS message to Batch Job**  |             **Real-time analysis progress tracking**              |

## 4. AI Chat & RAG

![Bedrock Chat](docs/assets/flow/input_prompt_to_bedrock.png)

**▲ AI-powered Q&A using AWS Bedrock Claude (Vector Search + LLM)**

## 5. Session Management

|                          Uploaded Videos                          |                         Session List                          |                         Session Detail                         |
| :---------------------------------------------------------------: | :-----------------------------------------------------------: | :------------------------------------------------------------: |
| ![Videos](docs/assets/page_screenshots/uploaded_video%20page.png) | ![Sessions](docs/assets/page_screenshots/sessions%20page.png) | ![Detail](docs/assets/page_screenshots/sessions_id%20page.png) |
|                    **List of analyzed videos**                    |              **Conversation sessions per video**              |                **Timeline + Chatbot interface**                |
