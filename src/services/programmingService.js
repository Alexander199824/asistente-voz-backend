const axios = require('axios');
const { logger, config } = require('../config');

/**
 * Servicio para obtener información sobre programación
 */
const ProgrammingService = {
  /**
   * Detecta si una consulta es sobre programación
   * @param {string} query - Consulta del usuario
   * @returns {boolean} - true si es una consulta de programación
   */
  isProgrammingQuery(query) {
    const programmingPatterns = [
      /\b(codigo|algorithm|algoritmo|code|programa|script)\b/i,
      /\b(java|javascript|python|c\+\+|c#|php|ruby|swift|kotlin|go|rust)\b/i,
      /\b(sort|ordenar|bubble sort|quick sort|insertion|selection|busqueda|search)\b/i,
      /\b(function|función|method|método|class|clase|objeto|object|array|arreglo|lista|list)\b/i,
      /\b(programacion|programming|desarrollo|development|software)\b/i,
      /\b(factorial|fibonacci|prime|primo|palindromo|palindrome)\b/i
    ];

    return programmingPatterns.some(pattern => pattern.test(query));
  },

  /**
   * Busca respuestas de programación usando la API de Stack Overflow
   * @param {string} query - Consulta del usuario
   * @returns {Promise<Object|null>} - Resultado de la búsqueda o null
   */
  async searchCode(query) {
    try {
      // Primero verificar si tenemos un algoritmo específico para esta consulta
      const specificAlgorithm = this.getSpecificAlgorithm(query);
      if (specificAlgorithm) {
        return specificAlgorithm;
      }
      
      // Detectar el lenguaje de programación mencionado en la consulta
      const language = this.detectProgrammingLanguage(query);
      
      // Preparar la consulta para Stack Overflow
      let searchQuery = query;
      if (language) {
        searchQuery += ` [${language}]`;
      }
      
      logger.info(`Buscando código para: "${searchQuery}"`);
      
      // Realizar la petición a la API de Stack Overflow
      const response = await axios.get('https://api.stackexchange.com/2.3/search/advanced', {
        params: {
          order: 'desc',
          sort: 'relevance',
          q: searchQuery,
          site: 'stackoverflow',
          filter: 'withbody', // Incluir el cuerpo de las respuestas
          pagesize: 5, // Limitar a 5 resultados
          accepted: true // Preferir respuestas aceptadas
        },
        timeout: 10000 // 10 segundos de timeout
      });
      
      // Verificar si tenemos resultados
      if (!response.data || !response.data.items || response.data.items.length === 0) {
        return null;
      }
      
      // Intentar encontrar una pregunta con respuesta aceptada
      for (const item of response.data.items) {
        if (item.is_answered) {
          // Obtener los detalles de la pregunta y sus respuestas
          const answerResponse = await axios.get(`https://api.stackexchange.com/2.3/questions/${item.question_id}/answers`, {
            params: {
              order: 'desc',
              sort: 'votes',
              site: 'stackoverflow',
              filter: 'withbody'
            },
            timeout: 10000
          });
          
          if (answerResponse.data && answerResponse.data.items && answerResponse.data.items.length > 0) {
            // Tomar la respuesta con más votos
            const bestAnswer = answerResponse.data.items[0];
            
            // Extraer el código de la respuesta
            const code = this.extractCodeFromHTML(bestAnswer.body);
            
            if (code) {
              return {
                answer: `Aquí tienes un código de ${language || 'programación'} que puede ayudarte:\n\n${code}`,
                source: 'Stack Overflow',
                context: item.title,
                url: item.link,
                language: language || 'desconocido'
              };
            }
          }
        }
      }
      
      // Si no encontramos código específico, usar un algoritmo básico si es posible
      const basicAlgorithm = this.getBasicAlgorithm(query);
      if (basicAlgorithm) {
        return basicAlgorithm;
      }
      
      // Finalmente, como último recurso, usar la primera respuesta como general
      const firstItem = response.data.items[0];
      return {
        answer: `He encontrado información relacionada: "${firstItem.title}". Puedes ver los detalles en: ${firstItem.link}`,
        source: 'Stack Overflow',
        context: 'Información general',
        url: firstItem.link
      };
      
    } catch (error) {
      logger.error('Error al buscar código en Stack Overflow:', error);
      // Intentar con algoritmos locales como respaldo
      const localAlgorithm = this.getSpecificAlgorithm(query) || this.getBasicAlgorithm(query);
      if (localAlgorithm) {
        return localAlgorithm;
      }
      return null;
    }
  },
  
  /**
   * Detecta el lenguaje de programación mencionado en la consulta
   * @param {string} query - Consulta del usuario
   * @returns {string|null} - Lenguaje detectado o null
   */
  detectProgrammingLanguage(query) {
    const languages = {
      java: /\bjava\b(?!\s*script)/i,
      javascript: /\bjavascript\b|\bjs\b/i,
      python: /\bpython\b|\bpy\b/i,
      'c++': /\bc\+\+\b|\bcpp\b/i,
      'c#': /\bc#\b|\bcsharp\b/i,
      php: /\bphp\b/i,
      ruby: /\bruby\b/i,
      swift: /\bswift\b/i,
      kotlin: /\bkotlin\b/i,
      go: /\bgo\b(?!\s*lang)/i,
      golang: /\bgolang\b/i,
      rust: /\brust\b/i
    };
    
    for (const [language, pattern] of Object.entries(languages)) {
      if (pattern.test(query)) {
        return language;
      }
    }
    
    return null;
  },
  
  /**
   * Extrae bloques de código de contenido HTML
   * @param {string} html - Contenido HTML
   * @returns {string|null} - Código extraído o null
   */
  extractCodeFromHTML(html) {
    try {
      // Extraer bloques de código <pre><code>...</code></pre>
      const codeBlockRegex = /<pre\s*.*?><code\s*.*?>([\s\S]*?)<\/code><\/pre>/gi;
      const matches = [...html.matchAll(codeBlockRegex)];
      
      if (matches && matches.length > 0) {
        // Decodificar entidades HTML
        let codeBlock = matches[0][1]
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'")
          .replace(/&amp;/g, '&');
        
        // Eliminar posibles tags HTML adicionales
        codeBlock = codeBlock.replace(/<[^>]*>/g, '');
        
        return codeBlock;
      }
      
      // Si no encontramos bloques de código, buscar cualquier texto entre <code>
      const inlineCodeRegex = /<code\s*.*?>([\s\S]*?)<\/code>/gi;
      const inlineMatches = [...html.matchAll(inlineCodeRegex)];
      
      if (inlineMatches && inlineMatches.length > 0) {
        const allCodeSegments = inlineMatches.map(match => 
          match[1]
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .replace(/&amp;/g, '&')
            .replace(/<[^>]*>/g, '')
        ).join('\n\n');
        
        return allCodeSegments;
      }
      
      return null;
    } catch (error) {
      logger.error('Error al extraer código de HTML:', error);
      return null;
    }
  },

  /**
   * Detecta y proporciona algoritmos específicos solicitados
   * @param {string} query - Consulta del usuario
   * @returns {Object|null} - Algoritmo solicitado o null
   */
  getSpecificAlgorithm(query) {
    const lowerQuery = query.toLowerCase();
    const language = this.detectProgrammingLanguage(query) || 'javascript';
    
    // Factorial
    if (lowerQuery.includes('factorial')) {
      if (language === 'javascript') {
        return {
          answer: `Aquí tienes un código para calcular el factorial en JavaScript:

\`\`\`javascript
// Función iterativa para calcular el factorial
function factorial(n) {
    if (n < 0) return null; // El factorial no está definido para números negativos
    if (n === 0 || n === 1) return 1;
    
    let result = 1;
    for (let i = 2; i <= n; i++) {
        result *= i;
    }
    return result;
}

// Función recursiva para calcular el factorial
function factorialRecursivo(n) {
    if (n < 0) return null;
    if (n === 0 || n === 1) return 1;
    return n * factorialRecursivo(n - 1);
}

// Ejemplos de uso
console.log("Factorial de 5 (iterativo):", factorial(5)); // 120
console.log("Factorial de 5 (recursivo):", factorialRecursivo(5)); // 120
\`\`\`

Esta implementación incluye dos versiones: una iterativa y otra recursiva. La versión iterativa es más eficiente para números grandes, mientras que la recursiva es más elegante pero puede causar desbordamiento de pila para valores grandes de n.`,
          source: 'Biblioteca local',
          context: 'Algoritmo de factorial en JavaScript',
          language: 'javascript'
        };
      } else if (language === 'python') {
        return {
          answer: `Aquí tienes un código para calcular el factorial en Python:

\`\`\`python
def factorial_iterativo(n):
    """Calcula el factorial de n de forma iterativa."""
    if n < 0:
        return None  # El factorial no está definido para números negativos
    if n == 0 or n == 1:
        return 1
    
    result = 1
    for i in range(2, n + 1):
        result *= i
    return result

def factorial_recursivo(n):
    """Calcula el factorial de n de forma recursiva."""
    if n < 0:
        return None
    if n == 0 or n == 1:
        return 1
    return n * factorial_recursivo(n - 1)

# Ejemplos de uso
print("Factorial de 5 (iterativo):", factorial_iterativo(5))  # 120
print("Factorial de 5 (recursivo):", factorial_recursivo(5))  # 120

# Python también tiene una función incorporada en el módulo math
import math
print("Factorial de 5 (función incorporada):", math.factorial(5))  # 120
\`\`\`

Esta implementación incluye tres versiones: iterativa, recursiva y usando la función incorporada de Python. La versión incorporada es la más eficiente y segura para uso general.`,
          source: 'Biblioteca local',
          context: 'Algoritmo de factorial en Python',
          language: 'python'
        };
      } else if (language === 'java') {
        return {
          answer: `Aquí tienes un código para calcular el factorial en Java:

\`\`\`java
public class Factorial {
    
    // Método iterativo para calcular el factorial
    public static long factorialIterativo(int n) {
        if (n < 0) {
            throw new IllegalArgumentException("El factorial no está definido para números negativos");
        }
        if (n == 0 || n == 1) {
            return 1;
        }
        
        long resultado = 1;
        for (int i = 2; i <= n; i++) {
            resultado *= i;
        }
        return resultado;
    }
    
    // Método recursivo para calcular el factorial
    public static long factorialRecursivo(int n) {
        if (n < 0) {
            throw new IllegalArgumentException("El factorial no está definido para números negativos");
        }
        if (n == 0 || n == 1) {
            return 1;
        }
        return n * factorialRecursivo(n - 1);
    }
    
    public static void main(String[] args) {
        int numero = 5;
        System.out.println("Factorial de " + numero + " (iterativo): " + factorialIterativo(numero));
        System.out.println("Factorial de " + numero + " (recursivo): " + factorialRecursivo(numero));
    }
}
\`\`\`

Esta implementación incluye dos versiones: una iterativa y otra recursiva. La versión iterativa es generalmente más eficiente para números grandes, mientras que la recursiva puede causar desbordamiento de pila para valores grandes.

Ten en cuenta que Java tiene límites en el tipo 'long', por lo que este código solo funcionará correctamente hasta el factorial de 20. Para valores mayores, necesitarías usar BigInteger.`,
          source: 'Biblioteca local',
          context: 'Algoritmo de factorial en Java',
          language: 'java'
        };
      }
    }
    
    // QuickSort
    if (lowerQuery.includes('quicksort') || (lowerQuery.includes('quick') && lowerQuery.includes('sort'))) {
      if (language === 'java') {
        return {
          answer: `Aquí tienes una implementación de QuickSort en Java:

\`\`\`java
import java.util.Arrays;

public class QuickSort {
    
    public static void quickSort(int[] arr) {
        quickSort(arr, 0, arr.length - 1);
    }
    
    private static void quickSort(int[] arr, int low, int high) {
        if (low < high) {
            // Encontrar el pivote, después del cual el elemento está en la posición correcta
            int pivotIndex = partition(arr, low, high);
            
            // Ordenar recursivamente los elementos antes y después del pivote
            quickSort(arr, low, pivotIndex - 1);
            quickSort(arr, pivotIndex + 1, high);
        }
    }
    
    private static int partition(int[] arr, int low, int high) {
        // Elegir el elemento más a la derecha como pivote
        int pivot = arr[high];
        // Índice del elemento más pequeño
        int i = low - 1;
        
        for (int j = low; j < high; j++) {
            // Si el elemento actual es menor que el pivote
            if (arr[j] < pivot) {
                i++;
                // Intercambiar arr[i] y arr[j]
                swap(arr, i, j);
            }
        }
        
        // Intercambiar arr[i+1] y arr[high] (el pivote)
        swap(arr, i + 1, high);
        
        return i + 1;
    }
    
    private static void swap(int[] arr, int i, int j) {
        int temp = arr[i];
        arr[i] = arr[j];
        arr[j] = temp;
    }
    
    // Método principal para probar el QuickSort
    public static void main(String[] args) {
        int[] arr = {10, 7, 8, 9, 1, 5};
        System.out.println("Array original: " + Arrays.toString(arr));
        
        quickSort(arr);
        
        System.out.println("Array ordenado: " + Arrays.toString(arr));
    }
}
\`\`\`

Este algoritmo tiene una complejidad temporal promedio de O(n log n), lo que lo hace muy eficiente para conjuntos de datos grandes. En el peor caso (cuando el array ya está ordenado o en orden inverso), la complejidad es O(n²), pero esto es raro en la práctica.`,
          source: 'Biblioteca local',
          context: 'Implementación de QuickSort en Java',
          language: 'java'
        };
      } else if (language === 'python') {
        return {
          answer: `Aquí tienes una implementación de QuickSort en Python:

\`\`\`python
def quick_sort(arr):
    """
    Ordena un array utilizando el algoritmo QuickSort
    """
    if len(arr) <= 1:
        return arr
    
    # Elegir el pivote (aquí usamos el elemento del medio)
    pivot = arr[len(arr) // 2]
    
    # Crear subarrays: elementos menores, iguales y mayores que el pivote
    left = [x for x in arr if x < pivot]
    middle = [x for x in arr if x == pivot]
    right = [x for x in arr if x > pivot]
    
    # Recursivamente ordenar los subarrays y combinarlos
    return quick_sort(left) + middle + quick_sort(right)

# Implementación alternativa usando particionamiento in-place
def quick_sort_in_place(arr, low=None, high=None):
    """
    Implementación de QuickSort con particionamiento in-place
    """
    if low is None:
        low = 0
    if high is None:
        high = len(arr) - 1
    
    if low < high:
        # Encontrar el índice de partición
        pi = partition(arr, low, high)
        
        # Ordenar recursivamente las particiones
        quick_sort_in_place(arr, low, pi - 1)
        quick_sort_in_place(arr, pi + 1, high)
    
    return arr

def partition(arr, low, high):
    """
    Función auxiliar para particionar el array
    """
    # Elegir el pivote como el elemento más a la derecha
    pivot = arr[high]
    i = low - 1
    
    for j in range(low, high):
        # Si el elemento actual es menor que el pivote
        if arr[j] <= pivot:
            i += 1
            arr[i], arr[j] = arr[j], arr[i]
    
    # Colocar el pivote en su posición correcta
    arr[i + 1], arr[high] = arr[high], arr[i + 1]
    return i + 1

# Ejemplo de uso
if __name__ == "__main__":
    # Usando la versión funcional
    arr1 = [10, 7, 8, 9, 1, 5]
    print("Array original:", arr1)
    sorted_arr = quick_sort(arr1)
    print("Array ordenado (versión funcional):", sorted_arr)
    
    # Usando la versión in-place
    arr2 = [10, 7, 8, 9, 1, 5]
    quick_sort_in_place(arr2)
    print("Array ordenado (versión in-place):", arr2)
\`\`\`

Esta implementación incluye dos versiones del algoritmo QuickSort:
1. Una versión funcional que crea nuevas listas en cada recursión
2. Una versión in-place que modifica el array original sin crear nuevas listas

La primera es más clara y fácil de entender, pero la segunda es más eficiente en términos de memoria.`,
          source: 'Biblioteca local',
          context: 'Implementación de QuickSort en Python',
          language: 'python'
        };
      } else if (language === 'javascript') {
        return {
          answer: `Aquí tienes una implementación de QuickSort en JavaScript:

\`\`\`javascript
// Implementación básica de QuickSort
function quickSort(arr) {
    if (arr.length <= 1) {
        return arr;
    }
    
    // Elegir el pivote (usamos el elemento del medio)
    const pivotIndex = Math.floor(arr.length / 2);
    const pivot = arr[pivotIndex];
    
    // Crear subarrays
    const less = [];
    const equal = [];
    const greater = [];
    
    // Particionar el array
    for (let i = 0; i < arr.length; i++) {
        if (arr[i] < pivot) {
            less.push(arr[i]);
        } else if (arr[i] === pivot) {
            equal.push(arr[i]);
        } else {
            greater.push(arr[i]);
        }
    }
    
    // Recursivamente ordenar los subarrays y combinarlos
    return [...quickSort(less), ...equal, ...quickSort(greater)];
}

// Implementación in-place de QuickSort
function quickSortInPlace(arr, left = 0, right = arr.length - 1) {
    if (left < right) {
        const pivotIndex = partition(arr, left, right);
        
        // Ordenar recursivamente las dos mitades
        quickSortInPlace(arr, left, pivotIndex - 1);
        quickSortInPlace(arr, pivotIndex + 1, right);
    }
    
    return arr;
}

function partition(arr, left, right) {
    // Usar el último elemento como pivote
    const pivot = arr[right];
    let i = left - 1;
    
    for (let j = left; j < right; j++) {
        if (arr[j] <= pivot) {
            i++;
            // Intercambiar elementos
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
    }
    
    // Colocar el pivote en su posición correcta
    [arr[i + 1], arr[right]] = [arr[right], arr[i + 1]];
    return i + 1;
}

// Ejemplos de uso
const arr1 = [10, 7, 8, 9, 1, 5];
console.log("Array original:", arr1);

const sortedArr1 = quickSort([...arr1]); // Creamos una copia para no modificar el original
console.log("Array ordenado (versión funcional):", sortedArr1);

const arr2 = [10, 7, 8, 9, 1, 5];
quickSortInPlace(arr2);
console.log("Array ordenado (versión in-place):", arr2);
\`\`\`

Esta implementación incluye dos versiones del algoritmo QuickSort:
1. Una versión funcional que crea nuevos arrays en cada recursión
2. Una versión in-place que modifica el array original

La versión in-place es más eficiente en términos de memoria, pero la versión funcional puede ser más clara y fácil de entender.`,
          source: 'Biblioteca local',
          context: 'Implementación de QuickSort en JavaScript',
          language: 'javascript'
        };
      }
    }
    
    // Algoritmo de ordenación (catch-all si no es específicamente quicksort)
    if ((lowerQuery.includes('sort') || lowerQuery.includes('ordenar') || lowerQuery.includes('ordenación')) && 
        !(lowerQuery.includes('quicksort') || (lowerQuery.includes('quick') && lowerQuery.includes('sort')))) {
      return this.getBasicAlgorithm(query);
    }
    
    return null;
  },

  /**
   * Alternativa para algoritmos básicos
   * @param {string} query - Consulta del usuario
   * @returns {Object|null} - Algoritmo básico o null
   */
  getBasicAlgorithm(query) {
    // Detectar qué tipo de algoritmo está solicitando
    const lowerQuery = query.toLowerCase();
    
    // Algoritmo de ordenación
    if (lowerQuery.includes('sort') || lowerQuery.includes('orden')) {
      const language = this.detectProgrammingLanguage(query) || 'java';
      
      // Proveer implementación básica según el lenguaje
      switch (language) {
        case 'java':
          return {
            answer: `Aquí tienes un algoritmo de ordenación ascendente en Java:

\`\`\`java
import java.util.Arrays;

public class OrdenacionAscendente {
    // Método de ordenación por burbuja
    public static void bubbleSort(int[] arr) {
        int n = arr.length;
        for (int i = 0; i < n - 1; i++) {
            for (int j = 0; j < n - i - 1; j++) {
                if (arr[j] > arr[j + 1]) {
                    // Intercambiar elementos
                    int temp = arr[j];
                    arr[j] = arr[j + 1];
                    arr[j + 1] = temp;
                }
            }
        }
    }
    
    // Método principal para probar la ordenación
    public static void main(String[] args) {
        int[] numeros = {64, 34, 25, 12, 22, 11, 90};
        System.out.println("Array original: " + Arrays.toString(numeros));
        
        bubbleSort(numeros);
        
        System.out.println("Array ordenado: " + Arrays.toString(numeros));
    }
}
\`\`\`

También puedes usar el método incorporado de Java:

\`\`\`java
import java.util.Arrays;

public class OrdenacionSimple {
    public static void main(String[] args) {
        int[] numeros = {64, 34, 25, 12, 22, 11, 90};
        System.out.println("Array original: " + Arrays.toString(numeros));
        
        // Método integrado de Java para ordenar
        Arrays.sort(numeros);
        
        System.out.println("Array ordenado: " + Arrays.toString(numeros));
    }
}
\`\`\``,
            source: 'Biblioteca local',
            context: 'Algoritmo de ordenación en Java',
            language: 'java'
          };
          
        case 'python':
          return {
            answer: `Aquí tienes un algoritmo de ordenación ascendente en Python:

\`\`\`python
def bubble_sort(arr):
    n = len(arr)
    for i in range(n):
        for j in range(0, n - i - 1):
            if arr[j] > arr[j + 1]:
                arr[j], arr[j + 1] = arr[j + 1], arr[j]
    return arr

# Ejemplo de uso
numeros = [64, 34, 25, 12, 22, 11, 90]
print("Lista original:", numeros)

lista_ordenada = bubble_sort(numeros)
print("Lista ordenada:", lista_ordenada)

# También puedes usar el método incorporado
numeros_2 = [64, 34, 25, 12, 22, 11, 90]
numeros_2.sort()
print("Lista ordenada con método incorporado:", numeros_2)
\`\`\``,
            source: 'Biblioteca local',
            context: 'Algoritmo de ordenación en Python',
            language: 'python'
          };
          
        case 'javascript':
          return {
            answer: `Aquí tienes un algoritmo de ordenación ascendente en JavaScript:

\`\`\`javascript
// Implementación del algoritmo de burbuja
function bubbleSort(arr) {
    const n = arr.length;
    
    for (let i = 0; i < n - 1; i++) {
        for (let j = 0; j < n - i - 1; j++) {
            if (arr[j] > arr[j + 1]) {
                // Intercambiar elementos
                [arr[j], arr[j + 1]] = [arr[j + 1], arr[j]];
            }
        }
    }
    
    return arr;
}

// Ejemplo de uso
const numeros = [64, 34, 25, 12, 22, 11, 90];
console.log("Array original:", numeros);

const numerosOrdenados = bubbleSort([...numeros]); // Creamos una copia para no modificar el original
console.log("Array ordenado con bubble sort:", numerosOrdenados);

// También puedes usar el método incorporado de JavaScript
const numeros2 = [64, 34, 25, 12, 22, 11, 90];
numeros2.sort((a, b) => a - b); // Es importante usar una función de comparación para números
console.log("Array ordenado con método incorporado:", numeros2);
\`\`\``,
            source: 'Biblioteca local',
            context: 'Algoritmo de ordenación en JavaScript',
            language: 'javascript'
          };
          
        default:
          return {
            answer: `Aquí tienes un pseudocódigo para un algoritmo de ordenación ascendente:

\`\`\`
Algoritmo OrdenarAscendente(array)
    Para i desde 0 hasta longitud(array) - 2:
        Para j desde 0 hasta longitud(array) - i - 2:
            Si array[j] > array[j+1] entonces
                temp = array[j]
                array[j] = array[j+1]
                array[j+1] = temp
            Fin Si
        Fin Para
    Fin Para
    Retornar array
Fin Algoritmo
\`\`\`

Este es un algoritmo de ordenación de burbuja básico que compara elementos adyacentes e intercambia su posición si están en el orden incorrecto.`,
            source: 'Biblioteca local',
            context: 'Pseudocódigo de ordenación',
            language: 'pseudocode'
          };
      }
    }
    
    // Si no es un algoritmo específico, devuelve null
    return null;
  }
};

module.exports = ProgrammingService;