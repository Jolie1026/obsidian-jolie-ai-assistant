# Jolie AI 어시스턴트 (Obsidian 플러그인)

> **참고**: 이 플러그인은 현재 Obsidian 커뮤니티에서 채택되지 않았습니다. 이는 Obsidian의 공식 플러그인 저장소에 나타나지 않으며 수동으로 설치해야 함을 의미합니다.

*[English](README.md) | [中文](README.zh-CN.md) | [한국어](README.ko.md)*

## 기능

- 명령 팔레트 또는 단축키를 통해 선택한 텍스트에 AI 처리 호출
- 드래그 및 크기 조정이 가능한 플로팅 윈도우 인터페이스
- 다양한 AI 텍스트 처리 기능 지원 (요약, 번역, 재작성 등)
- 사용자 정의 AI 처리 지침

## 설치

이 플러그인은 아직 Obsidian 커뮤니티에서 채택되지 않았으므로 수동으로 설치해야 합니다:

1. 이 저장소에서 최신 릴리스를 다운로드하세요
2. 압축을 풀고 폴더를 Obsidian 저장소의 플러그인 폴더에 복사하세요: `<your-vault>/.obsidian/plugins/`
3. Obsidian을 재시작하세요
4. Obsidian 설정에서 플러그인을 활성화하세요 ("안전 모드"를 먼저 끄셔야 할 수도 있습니다)

## 사용 방법

1. 처리하려는 텍스트를 선택하세요
2. 명령 팔레트(Ctrl/Cmd+P)를 사용하여 "Jolie AI"를 검색하세요
3. 원하는 AI 처리 기능을 선택하세요
4. 플로팅 윈도우에서 결과를 확인하세요
5. "삽입"을 클릭하여 처리된 텍스트를 현재 위치에 배치하세요

## 설정

플러그인 설정에서 다음을 구성할 수 있습니다:

- API 키 및 엔드포인트 구성
- AI 처리 지침 사용자 정의
- 플로팅 윈도우의 기본 크기 및 위치 설정
- 단축키 사용자 정의

## 개발

```bash
# 저장소 복제
git clone https://github.com/cnbpm/obsidian-jolie-ai-assistant.git

# 디렉토리로 이동
cd obsidian-jolie-ai-assistant

# 종속성 설치
npm install

# 개발 빌드
npm run dev
```

## 라이센스

[MIT](LICENSE)