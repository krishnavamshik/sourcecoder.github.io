
async function generateRoadmap(learningDetails) {
  const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

  const prompt = `Create a detailed learning roadmap for ${learningDetails.learningGoal} as a Mermaid graph diagram.
  The user has ${learningDetails.proficiency_math} math proficiency and ${learningDetails.proficiency_coding} coding proficiency.
  Their purpose is ${learningDetails.purpose} with ${learningDetails.timeInvestment} time investment.
  
  Structure it as a graph LR (left to right) Mermaid diagram that shows progression through topics.
  Include main topics and subtopics with connections showing dependencies.
  Don't include any explanations, just the pure Mermaid syntax.
  
  Format example:
  \`\`\`mermaid
  graph LR
    A1[Topic] --> A2[Subtopic]
    A1 --> A3[Subtopic]
    A2 --> B1[Next Topic]
    %% Create flow from left to right
  \`\`\`
  
  Important: Only return the Mermaid diagram code, nothing else.`;

  try {
    const result = await model.generateContent(prompt);
    const response = await result.response;
    let roadmapText = response.text();

    // Extract just the Mermaid code
    if (roadmapText.includes('```mermaid')) {
      roadmapText = roadmapText.split('```mermaid')[1].split('```')[0].trim();
    }

    return { 
      mermaidDiagram: roadmapText,
      roadmap: [] // Keep the original structure for compatibility
    };
  } catch (error) {
    console.error('Roadmap Generation Error:', error);
    throw new Error('Failed to generate roadmap: ' + error.message);
  }
}