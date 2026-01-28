# 🧠 CORTEX - AI Interview Assistant

**CORTEX** (Interview Insight) é um assistente pessoal alimentado por IA projetado para apoiar profissionais durante entrevistas técnicas e reuniões estratégicas em tempo real. Ele combina reconhecimento de voz de última geração com modelos de linguagem locais e na nuvem, tudo dentro de uma interface de overlay ultraleve e discreta.

---

## ✨ Principais Funcionalidades

### 🛡️ Modo Stealth (Anti-Print)
- **Janelas Invisíveis**: Utiliza transparência nativa e proteção de conteúdo para não aparecer em capturas de tela, compartilhamentos de tela (Zoom, Google Meet, Teams) ou gravações.
- **Cursor Neutro**: O cursor do mouse não muda de forma ao passar sobre o texto da IA, mantendo a presença do programa indetectável.

### 🎙️ Transcrição em Tempo Real
- **Faster-Whisper Local**: Transcrição de alta performance rodando diretamente na sua máquina (via Python).
- **Provedores Cloud**: Suporte para Deepgram e Groq para menor latência e maior precisão quando necessário.
- **Captura Dual**: Capta tanto o seu microfone quanto o áudio do sistema (entrevistador) via Loopback.

### 🤖 Inteligência Artificial (LLM)
- **Modelos Locais**: Integração com `node-llama-cpp` para rodar modelos GGUF (como Llama 3, Qwen) localmente com aceleração de GPU.
- **Assistentes Especializados**: Crie e alterne entre perfis (RH, Técnico, Liderança) com prompts de sistema personalizados.
- **Dicionário Técnico (Alt+Click)**: Selecione qualquer palavra ou frase no overlay para obter uma definição técnica imediata e contextualizada.

### 🖥️ Interface Minimalista
- **Floating Remote**: Uma barra de controle flutuante discreta para gerenciar gravação, trocar de assistente e disparar o "ASK".
- **Overlay de Resposta**: Exibição de texto em Markdown com suporte a títulos, listas e blocos de código.
- **Dashboard Central**: Interface completa para gerenciar modelos, configurações de áudio e customizar assistentes.

---

## 🚀 Como Começar

### Pré-requisitos
- **Node.js**: v18 ou superior.
- **Python**: 3.10+ (necessário para o Whisper local).
- **CABLE Virtual Audio**: Recomendado para captar o áudio do sistema no Windows.

### Instalação

1. Clone o repositório:
```bash
git clone https://github.com/seu-usuario/interview-insight.git
cd interview-insight
```

2. Instale as dependências do Node.js:
```bash
npm install
```

3. Instale as dependências do Python (para o serviço Whisper):
```bash
pip install faster-whisper numpy sounddevice
```

### Execução

Para iniciar o projeto em modo de desenvolvimento:
```bash
npm run dev
```

Para gerar o build de produção:
```bash
npm run build
```

---

## 🛠️ Arquitetura Técnica

- **Frontend**: React 19 + Vite + TailwindCSS.
- **Backend/Main**: Electron v28.
- **Comunicação**: IPC (Inter-Process Communication) para streaming de tokens e logs em tempo real.
- **IA Local**: `node-llama-cpp` (Node binding para llama.cpp).
- **Processamento de Áudio**: Bridge entre Node.js e Python (spawn pipeline) para o Whisper.

---

## ⚙️ Configurações Recomendadas

- **Modelos GGUF**: Recomendamos modelos como `Qwen2.5-7B-Instruct` ou `Llama-3-8B` para o melhor equilíbrio entre velocidade e precisão.
- **Aceleração**: O projeto detecta automaticamente CUDA (NVIDIA) para aceleração de GPU no Whisper e no LLM.

---

## 📜 Licença

Distribuído sob a licença MIT. Veja `LICENSE` para mais informações.

---

*Desenvolvido com foco em produtividade e excelência técnica.*
